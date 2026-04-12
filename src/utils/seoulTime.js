const SEOUL_TIME_ZONE = 'Asia/Seoul';

function getSeoulParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

export function getSeoulDate() {
  const { year, month, day } = getSeoulParts();
  return `${year}-${month}-${day}`;
}

export function getSeoulTime() {
  const { hour, minute } = getSeoulParts();
  return `${hour}:${minute}`;
}

export function getSeoulDateTime() {
  const { year, month, day, hour, minute, second } = getSeoulParts();
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export function formatSeoulClock(value, withSeconds = true) {
  if (!value) {
    return '-';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.slice(11, withSeconds ? 19 : 16);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const { hour, minute, second } = getSeoulParts(date);
  return withSeconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
}
