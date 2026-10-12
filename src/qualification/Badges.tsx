import { loc, type Locale } from '../lab/locale.js';
import { cx } from './_cx.js';
import { AVAILABILITY_LABEL, CONFIDENCE_LABEL, PROFILE_STATUS_HINT, PROFILE_STATUS_LABEL, SEVERITY_LABEL } from './locale.js';
import type { AvailabilityStatus, ProfileStatus, QualificationConfidence, QualificationSeverity } from './types.js';

export interface QualificationBadgeProps {
  locale?: Locale;
  className?: string;
}

/** Profile maturity badge: exploratory / partial / complete. Text always present (never colour only). */
export function ProfileStatusBadge({ status, locale = 'fr', className }: QualificationBadgeProps & { status: ProfileStatus }) {
  return (
    <span className={cx('n4q-badge', `n4q-profile-${status}`, className)} data-profile-status={status} title={loc(PROFILE_STATUS_HINT[status], locale)}>
      {loc(PROFILE_STATUS_LABEL[status], locale)}
    </span>
  );
}

/** Availability status plus its machine reason code, when any. */
export function AvailabilityBadge({
  status,
  reason,
  locale = 'fr',
  className,
}: QualificationBadgeProps & { status: AvailabilityStatus; reason?: string | null }) {
  return (
    <span className={cx('n4q-badge', `n4q-avail-${status}`, className)} data-availability={status}>
      {loc(AVAILABILITY_LABEL[status], locale)}
      {reason ? <code className="n4q-reason">{reason}</code> : null}
    </span>
  );
}

export function ConfidenceBadge({ confidence, locale = 'fr', className }: QualificationBadgeProps & { confidence: QualificationConfidence }) {
  return (
    <span className={cx('n4q-badge', `n4q-conf-${confidence}`, className)} data-confidence={confidence}>
      {loc(CONFIDENCE_LABEL[confidence], locale)}
    </span>
  );
}

export function SeverityBadge({ severity, locale = 'fr', className }: QualificationBadgeProps & { severity: QualificationSeverity }) {
  return (
    <span className={cx('n4q-badge', `n4q-sev-${severity}`, className)} data-severity={severity}>
      {loc(SEVERITY_LABEL[severity], locale)}
    </span>
  );
}
