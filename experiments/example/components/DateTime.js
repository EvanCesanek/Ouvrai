export class DateTime {
  static formatted() {
    var date = new Date();
    var yyyy = date.getFullYear().toString();
    var mm = ('0' + (date.getMonth() + 1)).slice(-2); // Date object has 0-indexed months
    var dd = ('0' + date.getDate()).slice(-2);
    var hh = ('0' + date.getHours()).slice(-2);
    var nn = ('0' + date.getMinutes()).slice(-2);
    var ss = ('0' + date.getSeconds()).slice(-2);
    return [yyyy, mm, dd, hh, nn, ss].join('-');
  }
  static absolute() {
    return Date.now();
  }
  static relative() {
    return performance.now();
  }
}
