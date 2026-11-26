const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
const start = source.indexOf("let lastRenderedActiveWeekId=null;");
const end = source.indexOf("async function loadHistory", start);
assert.notEqual(start, -1, "weekly date state must exist");
assert.notEqual(end, -1, "weekly date controls must be defined before history loading");

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      value: "",
      textContent: "",
      disabled: false,
      classList: { toggle() {}, add() {} }
    });
  }
  return elements.get(id);
}

const context = {
  $: element,
  localDate: () => "2026-11-26",
  dateText: value => value,
  selectedReopenCompetitionId: null
};
vm.runInNewContext(source.slice(start, end), context);

const render = context.renderPeriodControls;
assert.equal(typeof render, "function");

element("weeklyStartDate").value = "2026-12-01";
element("weeklyEndDate").value = "2026-12-07";
render({ month_start: "2026-11-01", month_end: "2026-11-30" }, null);
assert.equal(element("weeklyStartDate").value, "2026-12-01", "manually selected dates must be preserved while no week is active");
assert.equal(element("weeklyEndDate").value, "2026-12-07", "manually selected end date must be preserved");

render(
  { month_start: "2026-11-01", month_end: "2026-11-30" },
  { id: "week-4", week_number: 4, week_start: "2026-11-21", week_end: "2026-11-22" }
);
assert.equal(element("weeklyStartDate").value, "2026-11-21", "active week dates must be reflected in the controls");
assert.equal(element("weeklyEndDate").value, "2026-11-22", "active week end date must be reflected in the controls");

render({ month_start: "2026-11-01", month_end: "2026-11-30" }, null);
assert.equal(element("weeklyStartDate").value, "2026-11-26", "ending a week must reset the old start date");
assert.equal(element("weeklyEndDate").value, "2026-11-26", "ending a week must reset the old end date");

element("weeklyStartDate").value = "2026-11-28";
element("weeklyEndDate").value = "2026-12-04";
render({ month_start: "2026-11-01", month_end: "2026-11-30" }, null);
assert.equal(element("weeklyStartDate").value, "2026-11-28", "new manual dates must not be overwritten on a later refresh");
assert.equal(element("weeklyEndDate").value, "2026-12-04", "new manual end date must not be overwritten on a later refresh");

console.log("weekly date controls tests passed");
