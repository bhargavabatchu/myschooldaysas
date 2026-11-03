ALTER TABLE academic.classes
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE academic.sections
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
