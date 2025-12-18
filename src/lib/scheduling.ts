// Type for day of week (0 = Sunday, 1 = Monday, etc.)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Interface for postcode mapping
export interface PostcodeSchedule {
  postcode: string;
  days: DayOfWeek[];
}

// Map of postcodes to days of the week they are serviced
export const postcodeSchedules: PostcodeSchedule[] = [
  // Monday
  { postcode: 'KT14', days: [1] },
  { postcode: 'KT15', days: [1] },
  { postcode: 'KT16', days: [1] },
  { postcode: 'KT13', days: [1] },
  { postcode: 'GU21', days: [1] },
  { postcode: 'GU22', days: [1] },
  { postcode: 'GU23', days: [1] },
  { postcode: 'GU24', days: [1] },
  { postcode: 'GU25', days: [1] },
  
  // Tuesday
  { postcode: 'KT12', days: [2] },
  
  // Wednesday
  { postcode: 'KT1', days: [3] },
  { postcode: 'KT2', days: [3] },
  { postcode: 'KT3', days: [3, 6] }, // KT3 is serviced on both Wednesday and Saturday
  { postcode: 'KT5', days: [3] },
  { postcode: 'KT6', days: [3] },
  { postcode: 'KT7', days: [3] },
  { postcode: 'KT8', days: [3] },
  
  // Thursday
  { postcode: 'KT10', days: [4] },
  { postcode: 'KT11', days: [4] },
  { postcode: 'KT21', days: [4] },
  { postcode: 'KT22', days: [4] },
  { postcode: 'KT23', days: [4] },
  { postcode: 'KT24', days: [4] },
  
  // Friday
  { postcode: 'TW1', days: [5] },
  { postcode: 'TW2', days: [5] },
  { postcode: 'TW11', days: [5] },
  { postcode: 'TW12', days: [5] },
  { postcode: 'TW13', days: [5] },
  { postcode: 'TW14', days: [5] },
  { postcode: 'TW15', days: [5] },
  { postcode: 'TW16', days: [5] },
  { postcode: 'TW17', days: [5] },
  { postcode: 'TW18', days: [5] },
  { postcode: 'TW19', days: [5] },
  { postcode: 'TW20', days: [5] },
  
  // Saturday
  { postcode: 'KT4', days: [6] },
  { postcode: 'KT9', days: [6] },
  { postcode: 'KT17', days: [6] },
  { postcode: 'KT18', days: [6] },
  { postcode: 'KT19', days: [6] },
  { postcode: 'KT20', days: [6] },
];

/**
 * Check if a postcode is covered by our service
 * @param postcode The postcode to check
 * @returns True if the postcode is covered, false otherwise
 */
export function isPostcodeCovered(postcode: string): boolean {
  // Extract the postcode area (first part of the postcode)
  const postcodeArea = postcode.split(' ')[0].toUpperCase();
  
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
  
  // Return true only if we found a match
  return matchingSchedules.length > 0;
}

/**
 * Get the service days for a given postcode
 * @param postcode The postcode to check
 * @returns Array of days (0-6) when service is available for this postcode
 */
export function getServiceDaysForPostcode(postcode: string): DayOfWeek[] {
  // Extract the postcode area (first part of the postcode)
  const postcodeArea = postcode.split(' ')[0].toUpperCase();
  
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
  
  // If no matches found, return empty array (no coverage)
  if (matchingSchedules.length === 0) {
    return [];
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
 * Get day name for a date
 * @param date Date to get day name for
 * @returns Day name (e.g., "Monday")
 */
export function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}
