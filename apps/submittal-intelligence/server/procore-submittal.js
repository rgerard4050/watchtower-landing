'use strict';

function nameOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.label || value.title || value.login || '';
}

function attachmentList(record) {
  const pools = [record.attachments, record.current_revision && record.current_revision.attachments]
    .filter(Array.isArray);
  return pools.flat().map((attachment) => ({
    id: attachment.id || null,
    name: attachment.name || attachment.filename || attachment.file_name || 'Attachment',
    content_type: attachment.content_type || attachment.mime_type || null,
    size: attachment.file_size || attachment.size || null,
  }));
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

module.exports = { normalizeSubmittal };
