// No-dependency check of roles and tokens:  npm run test:auth
import assert from 'node:assert/strict';
import { makeAuth } from '../auth.js';

let t = 1_000_000;
const a = makeAuth({ admin: 'boss', scorer: 'bat', now: () => t, tokenDays: 1 });
assert.equal(a.roleForPassword('boss'), 'admin');
assert.equal(a.roleForPassword('bat'), 'scorer');
assert.equal(a.roleForPassword('nope'), null);
assert.equal(a.roleForPassword(''), null);

const adminTok = a.sign('admin'), scorerTok = a.sign('scorer');
assert.equal(a.verify(adminTok), 'admin');
assert.equal(a.verify(scorerTok), 'scorer');
assert.equal(a.verify(adminTok + 'x'), null, 'tampered signature');
assert.equal(a.verify(`${Buffer.from(JSON.stringify({ r: 'admin', e: t + 1e9 })).toString('base64url')}.${scorerTok.split('.')[1]}`), null, 'a scorer signature can not be moved onto an admin payload');
assert.equal(a.verify('garbage'), null);
assert.equal(a.verify(undefined), null);
t += 2 * 24 * 60 * 60 * 1000;
assert.equal(a.verify(adminTok), null, 'expired');
t = 1_000_000;

// another set of passwords can't accept these tokens
assert.equal(makeAuth({ admin: 'x', scorer: 'y', now: () => t }).verify(adminTok), null);

// middleware: 401 with no token, 403 for the wrong role, passes otherwise
const run = (mw, header) => {
  let out = { next: false };
  mw({ get: () => header, method: 'POST' }, { status: (c) => ({ json: (b) => { out = { code: c, ...b }; } }) }, () => { out = { next: true }; });
  return out;
};
assert.equal(run(a.requireRole('scorer'), undefined).code, 401);
assert.equal(run(a.requireRole('scorer'), `Bearer ${scorerTok}`).next, true);
assert.equal(run(a.requireRole('scorer'), `Bearer ${adminTok}`).next, true, 'admin can score too');
assert.equal(run(a.requireRole('admin'), `Bearer ${scorerTok}`).code, 403);
assert.equal(run(a.requireRole('admin'), `Bearer ${adminTok}`).next, true);
const get = a.writes('admin')({ get: () => undefined, method: 'GET' }, {}, () => 'passed');
assert.equal(get, 'passed', 'reads stay public');
console.log('auth ok');
