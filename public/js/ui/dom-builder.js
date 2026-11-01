/**
 * Safe DOM element construction utilities enforcing Trusted Types compliance.
 * Completely eschews innerHTML sinks in favor of programmatic node and text assembly.
 */

/**
 * Creates an HTMLElement with strongly typed attributes and child nodes.
 *
 * @param {string} tagName
 * @param {Record<string, string | number | boolean | null | undefined>} [attributes]
 * @param {...(Node | string | null | undefined)} children
 * @returns {HTMLElement}
 */
export function el(tagName, attributes = {}, ...children) {
  const element = document.createElement(tagName);

  for (const [attrName, attrValue] of Object.entries(attributes)) {
    if (attrValue != null && attrValue !== false) {
      element.setAttribute(attrName, attrValue === true ? '' : String(attrValue));
    }
  }

  element.append(...children.filter((child) => child != null));
  return element;
}

/**
 * Type-safe element lookup scoped to a parent container.
 * @param {ParentNode} container
 * @param {string} elementId
 * @returns {HTMLElement}
 */
export const byId = (container, elementId) =>
  /** @type {HTMLElement} */ (container.querySelector(`#${elementId}`));
