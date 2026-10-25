const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const XLSX = require('xlsx');

async function importWorkbook(sheets, existing = [], atCommit = existing) {
  const filename = path.resolve(__dirname, '../routes/leads.js');
  const routeRequire = createRequire(filename);
  const statements = [];
  const inserted = [];
  const client = {
    async query(sql, values) {
      statements.push(sql);
      if (sql.includes('FROM leads WHERE deleted_at IS NULL')) return { rows: atCommit };
      if (sql.startsWith('INSERT INTO leads (')) {
        for (let i = 0; i < values.length; i += 24) inserted.push(values.slice(i, i + 24));
        return { rows: Array.from({ length: values.length / 24 }, (_, i) => ({ id: i + 100 })) };
      }
      if (sql.includes('INSERT INTO import_history')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
    release() {},
  };
  const db = {
    getLeadPhones: async () => existing.flatMap(lead =>
      [lead.phone_number, lead.whatsapp_number, lead.secondary_phone_number].map(phone_number => ({ phone_number }))),
    getLeadEmails: async () => existing.map(lead => ({ email: lead.email })),
    getUsers: async () => [],
    query: async () => ({ rows: [] }),
    pool: { connect: async () => client },
  };
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => name === '../config/database' ? db
      : name === '../middleware/auth' ? { authenticate() {}, requireAdmin() {} }
      : name === 'fs' ? { ...fs, existsSync: () => true, writeFileSync() {} }
      : routeRequire(name),
    module: moduleStub, exports: moduleStub.exports,
    console: { log() {}, error() {}, warn() {} }, Buffer, __dirname: path.dirname(filename),
  }, { filename });
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const route = moduleStub.exports.stack.find(layer => layer.route?.path === '/bulk-import').route;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  await route.stack.at(-1).handle({
    user: { id: 7, role: 'ADMIN' }, body: {},
    file: { originalname: 'test.xlsx', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) },
  }, res);
  assert.equal(res.code, 200, JSON.stringify(res.data));
  return { ...res.data, statements, inserted };
}

test('existing primary phone cannot be replaced by a unique alternate number or numeric ID', async () => {
  const result = await importWorkbook({ Leads: [
    ['Name', 'Phone', 'Secondary Phone', 'Reference ID'],
    ['Repeat', '9876543210', '9123456780', '12345678901'],
  ] }, [{ id: 1, phone_number: '9876543210' }]);
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
});

test('existing WhatsApp or secondary contact makes the entire row a duplicate', async () => {
  const result = await importWorkbook({ Leads: [
    ['Name', 'Phone', 'WhatsApp Number', 'Secondary Phone'],
    ['Repeat WA', '9123456780', '+91 98765 43210', ''],
    ['Repeat alternate', '9234567810', '', '9988776655'],
  ] }, [{ whatsapp_number: '9876543210', secondary_phone_number: '9988776655' }]);
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 2);
});

test('duplicates across sheets and international formats are skipped; equal names remain valid', async () => {
  const result = await importWorkbook({
    Leads: [['Name', 'Phone', 'Email'], ['Same name', '+91 98765 43210', 'One@Example.com']],
    More: [['Name', 'Phone', 'Email'], ['Repeat', '9876543210', ''],
      ['Same name', '9123456780', 'two@example.com'], ['Email repeat', '9234567810', ' ONE@example.com ']],
  });
  assert.equal(result.created, 2);
  assert.equal(result.skipped, 2);
});

test('same-upload WhatsApp repeats cannot slip through by switching primary numbers', async () => {
  const result = await importWorkbook({ Leads: [
    ['Name', 'Phone', 'WhatsApp Number'],
    ['First', '9876543210', '9123456780'], ['Repeat', '9234567810', '9123456780'],
  ] });
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
});

test('rechecks contacts committed by another upload after acquiring the transaction lock', async () => {
  const result = await importWorkbook({ Leads: [
    ['Name', 'Phone', 'Country Code'], ['Repeat', '+971 501234567', '+971'],
  ] }, [], [{ id: 9, name: 'Existing', phone_number: '501234567', phone_country_code: '+971' }]);
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
  const lock = result.statements.findIndex(sql => sql.includes('pg_advisory_xact_lock'));
  const read = result.statements.findIndex(sql => sql.includes('FROM leads WHERE deleted_at IS NULL'));
  assert.ok(lock >= 0 && read > lock);
  assert.equal(result.skippedLeadsDetails[0].existing_lead_id, 9);
});

test('distinct contacts import normally and phone-less email rows deduplicate', async () => {
  const result = await importWorkbook({ Leads: [
    ['Name', 'Phone', 'Email'], ['First', '9876543210', 'first@example.com'],
    ['Email only', '', 'other@example.com'], ['Repeat', '', 'OTHER@example.com'],
  ] });
  assert.equal(result.created, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.inserted.length, 2);
});
