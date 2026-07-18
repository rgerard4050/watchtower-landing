UPDATE manifests SET status = 'REVIEWING' WHERE status = 'reviewing';
UPDATE manifests SET status = 'APPROVED' WHERE status = 'approved';
UPDATE manifests SET status = 'PASSED' WHERE status = 'passed';
UPDATE manifests SET status = 'COMPLETED' WHERE status = 'completed';

ALTER TABLE manifests ALTER COLUMN status SET DEFAULT 'REVIEWING';
