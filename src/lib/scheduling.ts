// Type for day of week (0 = Sunday, 1 = Monday, etc.)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Interface for postcode mapping
export interface PostcodeSchedule {
  postcode: string;
  days: DayOfWeek[];
}

/**
 * Greenmaster's coverage, as two separate ideas.
 *
 * `COVERED_AREAS` are whole postcode AREAS — every district inside them is covered, so
 * DH covers DH1 through DH9 without listing them. The old matcher could not express
 * this: it only ever compared full outward codes, and a bare "DH" entry failed to match
 * "DH1" because the character after the prefix was a digit.
 *
 * `COVERED_DISTRICTS` are individual outward codes covered outside those areas.
 */
export const COVERED_AREAS: readonly string[] = ['DH', 'SR']

export const COVERED_DISTRICTS: readonly string[] = [
  'NE8',
  'NE9',
  'NE10',
  'NE31',
  'NE35',
  'NE36',
  'NE37',
  'NE38',
]

/**
 * Which days each covered postcode is visited.
 *
 * TODO — CONFIRM WITH THE BUSINESS. The round days were never supplied for Greenmaster,
 * so every covered postcode currently offers Monday to Friday. That is deliberately
 * permissive: it never tells a real customer we cannot come, it just does not route them
 * to the right crew day. Replace DEFAULT_SERVICE_DAYS with per-postcode entries in
 * `postcodeSchedules` once the rounds are known, exactly as the previous operator's
 * table did.
 */
export const DEFAULT_SERVICE_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5]

/**
 * Per-postcode overrides. Anything not listed here falls back to
 * DEFAULT_SERVICE_DAYS, so coverage and scheduling stay independent: adding a round day
 * never silently changes who is covered, and adding coverage never invents a round.
 */
export const postcodeSchedules: PostcodeSchedule[] = []

/** The outward code — "DH1 4AB" and "dh14ab" both give "DH1". */
export function outwardCodeOf(postcode: string): string {
  const normalised = (postcode ?? '').toUpperCase().replace(/[\s\-_]+/g, ' ').trim()
  if (!normalised) return ''
  // A typed space always separates outward from inward
  if (normalised.includes(' ')) return normalised.split(' ')[0].replace(/[^A-Z0-9]/g, '')
  // No space: strip the inward code (digit + two letters) off the end
  const cleaned = normalised.replace(/[^A-Z0-9]/g, '')
  return cleaned.replace(/\d[A-Z]{2}$/, '') || cleaned
}

/** The letters at the front of an outward code: "DH1" -> "DH", "NE31" -> "NE". */
function areaOf(outwardCode: string): string {
  return (outwardCode.match(/^[A-Z]{1,2}/) || [''])[0]
}

/**
 * Is this postcode inside the service area?
 *
 * Answered from COVERED_AREAS / COVERED_DISTRICTS, never from the round schedule — a
 * postcode with no round day assigned yet is still covered.
 */
export function isPostcodeCovered(postcode: string): boolean {
  const outwardCode = outwardCodeOf(postcode)
  if (!outwardCode) return false

  if (COVERED_AREAS.includes(areaOf(outwardCode))) return true
  return COVERED_DISTRICTS.includes(outwardCode)
}

/**
 * The days this postcode is visited.
 *
 * A covered postcode with no round entry falls back to DEFAULT_SERVICE_DAYS rather than
 * to nothing: an unassigned round must not read to the customer as "we cannot come".
 * An uncovered postcode still returns [] — that is a real answer, and the no-coverage
 * screen depends on it.
 */
export function getServiceDaysForPostcode(postcode: string): DayOfWeek[] {
  if (!isPostcodeCovered(postcode)) return [];

  const postcodeArea = outwardCodeOf(postcode);
  
  // Try to find exact match first
  let matchingSchedules = postcodeSchedules.filter(schedule => 
    postcodeArea === schedule.postcode
  );
  
  // If no exact match, try to find the most specific prefix match
  if (matchingSchedules.length === 0) {
    // Find all potential matches
    const potentialMatches = postcodeSchedules.filter(schedule => 
      postcodeArea.startsWith(schedule.postcode)
    );
    
    // If we have matches, find the most specific one (longest postcode)
    if (potentialMatches.length > 0) {
      const longestMatch = potentialMatches.reduce((longest, current) => 
        current.postcode.length > longest.postcode.length ? current : longest
      );
      matchingSchedules = [longestMatch];
    }
  }
  
  // Covered, but this postcode has no round assigned yet
  if (matchingSchedules.length === 0) {
    return [...DEFAULT_SERVICE_DAYS];
  }
  
  // Combine all service days from matching postcodes
  const serviceDays = matchingSchedules.flatMap(schedule => schedule.days);
  
  // Remove duplicates and sort
  return [...new Set(serviceDays)].sort() as DayOfWeek[];
}

/**
 * Get the next N dates for a specific day of the week
 * @param dayOfWeek The day of week (0-6, where 0 is Sunday)
 * @param count Number of dates to return
 * @returns Array of dates
 */
export function getNextDatesForDay(dayOfWeek: DayOfWeek, count: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  
  // Start from tomorrow to avoid same-day bookings
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 1);
  
  let currentDate = new Date(startDate);
  
  while (dates.length < count) {
    if (currentDate.getDay() === dayOfWeek) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

/**
 * Get the next available dates for a given postcode
 * @param postcode The postcode to check
 * @param datesPerDay Number of dates to return per service day
 * @returns Array of available dates
 */
export function getAvailableDatesForPostcode(postcode: string, datesPerDay: number = 3): Date[] {
  const serviceDays = getServiceDaysForPostcode(postcode);
  
  // Get dates for each service day
  const allDates = serviceDays.flatMap(day => getNextDatesForDay(day, datesPerDay));
  
  // Sort dates chronologically
  return allDates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Calculate consecutive weekly appointment dates
 * @param startDate The first appointment date
 * @param frequency Not used - kept for backward compatibility
 * @param count Number of appointments to calculate
 * @returns Array of consecutive weekly appointment dates
 */
export function calculateAppointmentDates(
  startDate: Date,
  frequency: number | 'one-off',
  count: number = 8
): Date[] {
  if (frequency === 'one-off') {
    return [new Date(startDate)];
  }
  
  // Clone the start date to avoid modifying the original
  const firstDate = new Date(startDate);
  const dates: Date[] = [firstDate];
  
  // Generate consecutive weekly dates
  for (let i = 1; i < count; i++) {
    // Create a new date object for each appointment
    const nextDate = new Date(firstDate);
    
    // Add exactly one week (7 days) for each subsequent appointment
    nextDate.setDate(firstDate.getDate() + (i * 7));
    
    dates.push(nextDate);
  }
  
  return dates;
}

/**
 * Format date as DD-MM-YYYY (day-month-year)
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Format appointment time payload as "Ordinal day FullMonth, YYYY, AM/PM"
 * Example: "12th February, 2026, PM"
 */
export function formatAppointmentTime(
  selectedDate: string,
  timePreference: 'morning' | 'afternoon'
): string {
  const period = timePreference === 'morning' ? 'AM' : 'PM';
  const dateMatch = selectedDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

  if (!dateMatch) {
    return `${selectedDate}, ${period}`;
  }

  const day = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const year = dateMatch[3];

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];

  const getOrdinal = (dayNumber: number): string => {
    const mod100 = dayNumber % 100;
    if (mod100 >= 11 && mod100 <= 13) {
      return `${dayNumber}th`;
    }

    switch (dayNumber % 10) {
      case 1:
        return `${dayNumber}st`;
      case 2:
        return `${dayNumber}nd`;
      case 3:
        return `${dayNumber}rd`;
      default:
        return `${dayNumber}th`;
    }
  };

  const monthName = monthNames[month - 1];
  if (!monthName || day < 1 || day > 31) {
    return `${selectedDate}, ${period}`;
  }

  return `${getOrdinal(day)} ${monthName}, ${year}, ${period}`;
}

/**
 * Get day name for a date
 * @param date Date to get day name for
 * @returns Day name (e.g., "Monday")
 */
export function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}
