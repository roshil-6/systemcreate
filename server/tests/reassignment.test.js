const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

// Load the real route handlers with an isolated database; never touch office data.
const filename = path.resolve(__dirname, '../routes/leads.js');
const routeRequire = createRequire(filename);
const lead = { id: 1, name: 'Test lead', status: 'Assigned', assigned_staff_id: 7 };
const staff = { id: 8, name: 'Recipient', email: 'recipient@toniosenora.com', role: 'HR' };
const db = {
  getLeads: async () => [lead],
  getUsers: async () => [staff],
  getUserName: async () => staff.name,
  updateLead: async (id, updates) => ({ ...lead, ...updates }),
  createNotification: async () => ({ id: 1 }),
  query: async () => ({ rows: [lead] }),
};
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  require: (name) => name === '../config/database' ? db
    : name === '../middleware/auth' ? { authenticate() {}, requireAdmin() {} }
    : routeRequire(name),
  module: moduleStub, exports: moduleStub.exports, console, Buffer, __dirname: path.dirname(filename),
}, { filename });

async function invoke(method, routePath, role, body) {
  const route = moduleStub.exports.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await route.stack.at(-1).handle({ user: { id: 7, role }, params: { id: '1' }, body }, res);
  return res;
}

for (const role of ['ADMIN', 'HR', 'SALES_TEAM_HEAD', 'SALES_TEAM', 'STAFF', 'PROCESSING']) {
  const allowed = ['ADMIN', 'HR'].includes(role);
  test(`${role}: single reassignment`, async () => {
    const res = await invoke('put', '/:id', role, { assigned_staff_id: 8 });
    assert.equal(res.code, allowed ? 200 : 403);
  });
  test(`${role}: bulk reassignment`, async () => {
    const res = await invoke('post', '/bulk-assign', role, { leadIds: [1], assigned_staff_id: 8 });
    assert.equal(res.code, allowed ? 200 : 403);
  });
  test(`${role}: saving other fields with unchanged assignee`, async () => {
    const res = await invoke('put', '/:id', role, { assigned_staff_id: '7', priority: 'hot' });
    assert.equal(res.code, 200);
    assert.equal(res.data.priority, 'hot');
  });
}
