'use strict';

function nameOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.label || value.title || value.login || '';
}

function attachmentRecords(record) {
  const pools = [record.attachments, record.current_revision && record.current_revision.attachments]
    .filter(Array.isArray);
  return pools.flat();
}

function attachmentList(record) {
  return attachmentRecords(record).map((attachment) => ({
    id: attachment.id || null,
    name: attachment.name || attachment.filename || attachment.file_name || 'Attachment',
    content_type: attachment.content_type || attachment.mime_type || null,
    size: attachment.file_size || attachment.size || null,
  }));
}

function roleScore(name, role) {
  const value = String(name || '').toLowerCase();
  const patterns = role === 'specification'
    ? [/requirement/, /specification/, /\bspec\b/, /rejection/, /reviewer/, /comment/, /mark.?up/, /returned/]
    : [/submitted/, /product.?data/, /shop.?drawing/, /certificate/, /submittal.?package/, /planned/];
  return patterns.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

async function preparePackage(record, download) {
  const pdfs = attachmentRecords(record).filter((item) => {
    const name = item.name || item.filename || item.file_name || '';
    const type = item.content_type || item.mime_type || '';
    return /\.pdf$/i.test(name) || /application\/pdf/i.test(type);
  });
  if (pdfs.length < 2) {
    const error = new Error('Attach one requirements PDF and one submitted-package PDF in Procore.');
    error.code = 'PROCORE_TWO_PDFS_REQUIRED';
    throw error;
  }
  const pick = (role, excluded) => pdfs
    .filter((item) => item !== excluded)
    .map((item) => ({ item, score: roleScore(item.name || item.filename || item.file_name, role) }))
    .sort((a, b) => b.score - a.score)[0];
  const specification = pick('specification');
  const submittal = pick('submittal', specification && specification.item);
  if (!specification || !submittal || specification.score < 1 || submittal.score < 1) {
    const error = new Error('Name one PDF as requirements/specification and the other as submitted product data/package.');
    error.code = 'PROCORE_ATTACHMENT_ROLES_REQUIRED';
    throw error;
  }

  const selected = [
    { role: 'specification', attachment: specification.item },
    { role: 'submittal', attachment: submittal.item },
  ];
  const files = await Promise.all(selected.map(async ({ role, attachment }) => {
    const name = attachment.name || attachment.filename || attachment.file_name || `${role}.pdf`;
    const url = attachment.url || attachment.download_url || attachment.file_url;
    if (!url) {
      const error = new Error(`Procore did not return a download link for ${name}.`);
      error.code = 'PROCORE_FILE_LINK_MISSING';
      throw error;
    }
    const result = await download(url);
    return { role, name, buffer: result.buffer, bytes: result.buffer.length };
  }));
  return { files, attachmentCount: pdfs.length };
}

function normalizeSubmittal(record = {}) {
  const spec = record.specification_section || {};
  const workflow = [record.workflow_data, record.submittal_workflow_items, record.workflow_items]
    .find(Array.isArray) || [];
  const responses = workflow.map((item) => ({
    name: nameOf(item.user || item.responder || item.ball_in_court),
    response: nameOf(item.response || item.status),
    comments: item.comments || item.comment || '',
    returned_date: item.returned_date || item.responded_at || null,
  })).filter((item) => item.name || item.response || item.comments);

  return {
    id: record.id,
    number: record.formatted_number || record.submittal_number || record.number || '',
    title: record.title || record.description || 'Untitled submittal',
    description: record.description || '',
    status: nameOf(record.status) || record.status_name || '',
    type: nameOf(record.submittal_type) || record.type_name || '',
    specification_section: [spec.number || record.specification_section_number, spec.description].filter(Boolean).join(' - '),
    submittal_manager: nameOf(record.submittal_manager),
    ball_in_court: nameOf(record.ball_in_court),
    attachments: attachmentList(record),
    responses,
  };
}

module.exports = { normalizeSubmittal, preparePackage };
