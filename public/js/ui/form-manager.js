/**
 * Form interaction manager: constraint validation, inline error messaging,
 * accessible ARIA status coordination, and input serialization.
 */

const LOCAL_MAX_LEAD_DAYS = 3 * 365 - 1;

/**
 * @typedef {import('../../../src/domain/contracts.js').EventDetails} EventDetails
 * @typedef {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} FormField
 */

/**
 * Accesses a form control by name.
 * @param {HTMLFormElement} formElement
 * @param {string} fieldName
 * @returns {FormField | RadioNodeList | null}
 */
export const field = (formElement, fieldName) =>
  /** @type {FormField | RadioNodeList | null} */ (formElement.elements.namedItem(fieldName));

/**
 * Validates form fields against standard HTML5 constraint validation rules.
 * Highlights errors and automatically focuses the first invalid element.
 *
 * @param {HTMLFormElement} formElement
 * @returns {boolean} true if all form controls are valid
 */
export function validate(formElement) {
  const eligibleFields = /** @type {FormField[]} */ ([...formElement.elements]).filter(
    (item) => item.willValidate,
  );

  for (const control of eligibleFields) {
    showFieldError(
      control,
      control.validity.valid ? '' : control.validationMessage || 'Please check this field.',
    );
  }

  const firstFailingControl = eligibleFields.find((control) => !control.validity.valid);
  firstFailingControl?.focus();
  return !firstFailingControl;
}

/**
 * Displays server-returned validation errors next to corresponding form inputs.
 *
 * @param {HTMLFormElement} formElement
 * @param {Record<string, string>} [errorFields]
 * @returns {string[]} error messages not mapped to any input in this form
 */
export function showFieldErrors(formElement, errorFields = {}) {
  const unmappedMessages = [];
  let initialErrorControl;

  for (const [fieldName, errorMessage] of Object.entries(errorFields)) {
    const errorTarget = showFieldError(field(formElement, fieldName), errorMessage);
    if (errorTarget) {
      initialErrorControl ??= errorTarget;
    } else {
      unmappedMessages.push(errorMessage);
    }
  }

  initialErrorControl?.focus();
  return unmappedMessages;
}

/**
 * Displays or clears an inline field error and toggles aria-invalid.
 *
 * @param {FormField | RadioNodeList | null} targetControl
 * @param {string} errorMessage
 * @returns {FormField | null}
 */
export function showFieldError(targetControl, errorMessage) {
  const controlElement =
    targetControl && 'id' in targetControl ? /** @type {FormField} */ (targetControl) : null;
  const messageSlot = controlElement ? document.getElementById(`${controlElement.id}-error`) : null;

  if (!controlElement || !messageSlot) return null;

  messageSlot.textContent = errorMessage;
  if (errorMessage) {
    controlElement.setAttribute('aria-invalid', 'true');
  } else {
    controlElement.removeAttribute('aria-invalid');
  }

  return errorMessage ? controlElement : null;
}

/**
 * Coordinates live region feedback and submit button accessibility states.
 *
 * @param {HTMLFormElement} formElement
 * @param {{ message?: string, error?: string, busy?: boolean }} statusConfig
 */
export function setStatus(formElement, { message = '', error = '', busy = false }) {
  const resolveTarget = (/** @type {string} */ selector) =>
    /** @type {HTMLElement} */ (formElement.querySelector(selector));

  formElement.setAttribute('aria-busy', String(busy));
  resolveTarget('[type="submit"]').setAttribute('aria-disabled', String(busy));
  resolveTarget('[role="status"]').textContent = message;
  resolveTarget('[role="alert"]').textContent = error;
}

/**
 * Serializes form fields into an EventDetails contract object.
 * @param {HTMLFormElement} formElement
 * @returns {EventDetails}
 */
export function readEvent(formElement) {
  const formData = Object.fromEntries(new FormData(formElement));
  return /** @type {EventDetails} */ ({
    ...formData,
    guests: Number(formData.guests),
    budget: Number(formData.budget),
  });
}

/**
 * Pre-populates form controls from a data dictionary.
 * @param {HTMLFormElement} formElement
 * @param {Record<string, string | number>} values
 */
export function fillForm(formElement, values) {
  for (const [key, value] of Object.entries(values)) {
    const targetControl = field(formElement, key);
    if (targetControl) {
      targetControl.value = String(value);
    }
  }
}

/**
 * Constrains the date input picker min and max values based on today's local date.
 * @param {HTMLInputElement} dateInput
 */
export function setDateLimits(dateInput) {
  const currentInstant = new Date();
  /** @param {Date} d */
  const formatIsoDate = (d) =>
    [d.getFullYear(), d.getMonth() + 1, d.getDate()]
      .map((part) => String(part).padStart(2, '0'))
      .join('-');

  dateInput.min = formatIsoDate(currentInstant);
  dateInput.max = formatIsoDate(
    new Date(
      currentInstant.getFullYear(),
      currentInstant.getMonth(),
      currentInstant.getDate() + LOCAL_MAX_LEAD_DAYS,
    ),
  );
}
