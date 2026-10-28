// The StaffSync UI kit: small components built on the Angular CDK, with no Angular Material.
// Import what a component needs from here, e.g. `imports: [SsButton, SsField, SsInput]`.
//
// Only from lazy code (the pages and their dialogs). Code that is in the first download (anything
// reached from app.config.ts: core/error, core/auth guards and interceptors) must import the single
// file instead, e.g. '../../shared/ui/toast/toast'. Through this barrel the whole kit and the CDK
// overlay it needs land in the initial bundle (it added 160 kB when Notifications did it).

export { SsButton, type SsButtonVariant } from './button/button';
export { SsCalendar, type SsCalendarPeriod, type SsCalendarRange } from './calendar/calendar';
export {
  SsCalendarPopup,
  SsCalendarPopupRef,
  type SsCalendarPopupConfig,
} from './calendar/calendar-popup';
export {
  addDays,
  addMonths,
  addYears,
  clampDate,
  compareDays,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  isValidDate,
  isWithinLimits,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './calendar/date-utils';
export { SsCheckbox } from './checkbox/checkbox';
export { SsChip } from './chip/chip';
export { SsDateInput } from './date-input/date-input';
export {
  SS_DIALOG_DATA,
  SsDialog,
  SsDialogActions,
  SsDialogClose,
  SsDialogContent,
  SsDialogRef,
  SsDialogTitle,
  type SsDialogConfig,
} from './dialog/dialog';
export {
  SsError,
  SsField,
  SsHint,
  SsInput,
  SsLabel,
  SsPrefix,
  SsSuffix,
  type SsFormControl,
} from './field/field';
export { SsIcon } from './icon/icon';
export { SsMenu, SsMenuItem, SsMenuTrigger } from './menu/menu';
export { SsPaginator, type SsPageEvent } from './paginator/paginator';
export { SsProgressBar, SsSpinner } from './progress/progress';
export { SsOptgroup, SsOption, SsSelect, type SsSelectChange } from './select/select';
export { SsSort, SsSortHeader, type SsSortChange, type SsSortDirection } from './sort/sort';
export { SsToast, type SsToastConfig, type SsToastRef } from './toast/toast';
export { SsToggle, SsToggleGroup } from './toggle-group/toggle-group';
