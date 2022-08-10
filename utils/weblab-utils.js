export function DaysHoursMinutesToSeconds(days, hours, minutes) {
  return ((24 * days + hours) * 60 + minutes) * 60;
}

export function dateStringMMDDYY() {
  var date = new Date();
  var formattedDate = ('0' + date.getDate()).slice(-2);
  var formattedMonth = ('0' + (date.getMonth() + 1)).slice(-2);
  var formattedYear = date.getFullYear().toString().slice(-2);
  var dateString = formattedMonth + formattedDate + formattedYear;
  return dateString;
}

export function dateStringYMDHMS() {
  var date = new Date();
  var formattedYear = date.getFullYear().toString();
  var formattedMonth = ('0' + (date.getMonth() + 1)).slice(-2); // JavaScript Date object has 0-indexed months
  var formattedDate = ('0' + date.getDate()).slice(-2);
  var formattedHours = ('0' + date.getHours()).slice(-2);
  var formattedMinutes = ('0' + date.getMinutes()).slice(-2);
  var formattedSeconds = ('0' + date.getSeconds()).slice(-2);

  var dateString =
    formattedYear +
    formattedMonth +
    formattedDate +
    '_' +
    formattedHours +
    formattedMinutes +
    formattedSeconds;
  return dateString;
}

export function ask(rl, query) {
  // rl must be opened and not paused
  rl.resume();
  return new Promise((resolve) => {
    rl.question(query, (input) => {
      rl.pause();
      resolve(input);
    });
  });
}
