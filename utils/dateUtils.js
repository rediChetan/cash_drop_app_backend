/**
 * Get current date and time in PST timezone
 * Returns datetime string in YYYY-MM-DD HH:mm:ss format
 * Handles DST automatically (PST/PDT)
 */
export const getPSTDateTime = () => {
  const now = new Date();
  
  // Use Intl.DateTimeFormat to get PST datetime components (handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};
