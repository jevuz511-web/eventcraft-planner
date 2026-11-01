/**
 * RFC 5545 iCalendar (.ics) serializer.
 * Generates calendar files for importing milestones and vendor deadlines
 * into Google Calendar, Outlook, and Apple Calendar.
 */

const MAX_OCTETS_PER_LINE = 75;

/**
 * Calculates the exact UTF-8 byte length for a given character without allocating buffers.
 * @param {string} char
 */
const getUtf8ByteCount = (char) => {
  const codePoint = /** @type {number} */ (char.codePointAt(0));
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  return codePoint < 0x10000 ? 3 : 4;
};

/**
 * Escapes characters with semantic meaning in iCalendar format.
 * @param {string} rawString
 */
const escapeCalendarText = (rawString) =>
  rawString.replace(/[\\;,]/g, '\\$&').replace(/\r\n?|\n/g, '\\n');

/**
 * Folds lines longer than 75 octets per RFC 5545 §3.1 specification.
 * @param {string} textLine
 */
function foldCalendarLine(textLine) {
  let foldedResult = '';
  let accumulatedOctets = 0;

  for (const character of textLine) {
    const charSize = getUtf8ByteCount(character);
    if (accumulatedOctets + charSize > MAX_OCTETS_PER_LINE) {
      foldedResult += '\r\n ';
      accumulatedOctets = 1;
    }
    foldedResult += character;
    accumulatedOctets += charSize;
  }

  return foldedResult;
}

/**
 * Assembles a complete RFC 5545 VCALENDAR payload from plan milestones.
 *
 * @param {{
 *   event: { date: string },
 *   plan: {
 *     title: string,
 *     timeline: { due: string, task: string }[],
 *     vendors: { due: string, type: string }[]
 *   }
 * }} planContainer
 * @param {Date} [clock]
 * @returns {string} CRLF-delimited iCalendar document
 */
export function buildIcs({ event, plan }, clock = new Date()) {
  const timestampString = clock.toISOString().replace(/[-:]|\.\d+/g, '');

  const calendarEvents = [
    ...plan.timeline.map(({ due, task }) => [due, task]),
    ...plan.vendors.map(({ due, type }) => [due, `Book: ${type}`]),
    [event.date, plan.title],
  ];

  const structuralLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Celebrate//AI Event Planner//EN',
    'CALSCALE:GREGORIAN',
    ...calendarEvents.flatMap(([targetDate, titleSummary], idx) => [
      'BEGIN:VEVENT',
      `UID:${timestampString}-${idx}@celebrate.planner`,
      `DTSTAMP:${timestampString}`,
      `DTSTART;VALUE=DATE:${targetDate.replaceAll('-', '')}`,
      `SUMMARY:${escapeCalendarText(titleSummary)}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];

  return `${structuralLines.map(foldCalendarLine).join('\r\n')}\r\n`;
}
