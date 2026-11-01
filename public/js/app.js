import { readSaved, writeSaved } from './core/persistence.js';
import { EMPTY, replacePlan, setProgress, undo } from './core/state-machine.js';
import { requestPlan } from './services/api-client.js';
import { buildIcs } from './services/calendar-export.js';
import { byId } from './ui/dom-builder.js';
import {
  field,
  fillForm,
  readEvent,
  setDateLimits,
  setStatus,
  showFieldError,
  showFieldErrors,
  validate,
} from './ui/form-manager.js';
import { renderPlan, renderProgress } from './ui/view-renderer.js';

const NETWORK_CONNECTIVITY_ERROR =
  'Could not reach the planner. Check your connection and try again.';

/** @type {Record<string, import('./core/state-machine.js').ProgressCategory>} */
const TRACKED_CHECKLIST_CATEGORIES = { vendor: 'booked', task: 'done' };

/**
 * @typedef {import('./core/state-machine.js').PlanState} PlanState
 * @typedef {import('./ui/form-manager.js').EventDetails} EventDetails
 * @typedef {import('./ui/form-manager.js').FormField} FormField
 */

/**
 * Initializes and wires the celebration planner user interface.
 */
export function initApp() {
  const planForm = /** @type {HTMLFormElement} */ (document.getElementById('plan-form'));
  const refineForm = /** @type {HTMLFormElement} */ (document.getElementById('refine-form'));
  const resultsRegion = byId(document, 'results');
  const undoActionButton = /** @type {HTMLButtonElement} */ (
    resultsRegion.querySelector('[data-action="undo"]')
  );
  const defaultPageTitle = document.title;

  /** @type {PlanState} */
  let appState = { ...EMPTY, current: readSaved() };

  setDateLimits(/** @type {HTMLInputElement} */ (field(planForm, 'date')));

  if (appState.current) {
    try {
      fillForm(planForm, appState.current.event);
      renderViewState(false);
    } catch {
      commitStateTransition(EMPTY);
    }
  }

  planForm.addEventListener('submit', (evt) => {
    evt.preventDefault();
    if (validate(planForm)) {
      executePlanSubmission(planForm, { event: readEvent(planForm) });
    }
  });

  refineForm.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const { current } = appState;
    if (!current || !validate(refineForm)) return;
    const feedbackText = /** @type {FormField} */ (field(refineForm, 'feedback')).value;
    executePlanSubmission(refineForm, {
      event: current.event,
      refine: { plan: current.plan, feedback: feedbackText },
    });
  });

  for (const formNode of [planForm, refineForm]) {
    formNode.addEventListener('input', (evt) =>
      showFieldError(/** @type {FormField} */ (evt.target), ''),
    );
  }

  resultsRegion.addEventListener('change', handleChecklistToggle);
  resultsRegion.addEventListener('click', handleActionCommand);

  /**
   * Persists and presents updated application state.
   * @param {PlanState} nextState
   * @param {boolean} [shouldFocusPlan]
   */
  function commitStateTransition(nextState, shouldFocusPlan = false) {
    appState = nextState;
    writeSaved(appState.current);
    renderViewState(shouldFocusPlan);
  }

  /**
   * Updates DOM layout and accessibility indicators based on current state.
   * @param {boolean} shouldFocusPlan
   */
  function renderViewState(shouldFocusPlan) {
    const { current, previous } = appState;
    resultsRegion.hidden = !current;

    if (!current) {
      document.title = defaultPageTitle;
      return;
    }

    renderPlan(resultsRegion, current);
    undoActionButton.hidden = !previous;
    document.title = `${current.plan.title} · Celebrate`;

    if (!shouldFocusPlan) return;
    byId(document, 'plan-title').focus({ preventScroll: true });
    resultsRegion.scrollIntoView({ block: 'start' });
  }

  /**
   * Dispatches generation or refinement requests to backend.
   * @param {HTMLFormElement} triggeringForm
   * @param {{ event: EventDetails, refine?: object }} requestPayload
   */
  async function executePlanSubmission(triggeringForm, requestPayload) {
    if (triggeringForm.getAttribute('aria-busy') === 'true') return;

    setStatus(triggeringForm, {
      message: 'Gemini is planning your celebration. This usually takes about 10 seconds…',
      busy: true,
    });

    try {
      const responseResult = await requestPlan(requestPayload);

      if (!responseResult.plan) {
        const unmappedErrors = showFieldErrors(triggeringForm, responseResult.fields);
        setStatus(triggeringForm, {
          error: [responseResult.error, ...unmappedErrors].join(' '),
        });
        return;
      }

      if (triggeringForm === refineForm) {
        triggeringForm.reset();
      }

      setStatus(triggeringForm, { message: 'Your plan is ready.' });

      const updatedPayload = { event: requestPayload.event, plan: responseResult.plan };
      commitStateTransition(
        replacePlan(appState, updatedPayload, {
          keepProgress: triggeringForm === refineForm,
        }),
        true,
      );
    } catch {
      setStatus(triggeringForm, { error: NETWORK_CONNECTIVITY_ERROR });
    }
  }

  /**
   * Handles user ticking vendor or milestone progress checkboxes.
   * @param {Event} evt
   */
  function handleChecklistToggle(evt) {
    const checkboxElement = /** @type {HTMLInputElement} */ (evt.target);
    const categoryKey = TRACKED_CHECKLIST_CATEGORIES[checkboxElement.name];
    if (!categoryKey || !appState.current) return;

    const updatedPlan = setProgress(
      appState.current,
      categoryKey,
      checkboxElement.value,
      checkboxElement.checked,
    );

    appState = { ...appState, current: updatedPlan };
    writeSaved(updatedPlan);
    renderProgress(resultsRegion, updatedPlan);
  }

  /**
   * Dispatches top-level plan action commands (Calendar, Print, Undo, Reset).
   * @param {MouseEvent} evt
   */
  function handleActionCommand(evt) {
    const eventTarget = /** @type {Element} */ (evt.target);
    const selectedAction = eventTarget.closest('[data-action]')?.getAttribute('data-action');
    const { current } = appState;
    if (!current) return;

    switch (selectedAction) {
      case 'calendar':
        triggerFileDownload('celebration-plan.ics', buildIcs(current), 'text/calendar');
        break;
      case 'print':
        window.print();
        break;
      case 'undo': {
        const historicalPlan = appState.previous;
        if (!historicalPlan) break;
        commitStateTransition(undo(appState), true);
        fillForm(planForm, historicalPlan.event);
        break;
      }
      case 'reset':
        if (!window.confirm('Start over? Your current plan will be cleared.')) break;
        commitStateTransition(EMPTY);
        planForm.reset();
        /** @type {HTMLInputElement} */ (planForm.querySelector('input')).focus();
        break;
    }
  }
}

/**
 * Initiates an in-browser file download via a temporary object URL.
 * @param {string} fileName
 * @param {string} fileContent
 * @param {string} mimeType
 */
function triggerFileDownload(fileName, fileContent, mimeType) {
  const blobUrl = URL.createObjectURL(new Blob([fileContent], { type: mimeType }));
  Object.assign(document.createElement('a'), { href: blobUrl, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(blobUrl));
}
