import { normalizeEmail, isValidEmail, INVALID_EMAIL_MESSAGE } from './emailValidation.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- normalizeEmail ---
assert(normalizeEmail('  Jamie@Example.COM ') === 'jamie@example.com', 'trim + lowercase');
assert(normalizeEmail('') === '', 'empty string');
assert(normalizeEmail(null) === '', 'null → empty');

// --- isValidEmail (Arrange-Act-Assert) ---
{
  // Arrange
  const samples = [
    ['you@example.com', true],
    ['Jamie@Example.COM', true],
    ['  a.b+tag@mail.co.uk ', true],
    ['not-an-email', false],
    ['missing-at.com', false],
    ['@nodomain.com', false],
    ['no-tld@domain', false],
    ['spaces emma@example.com', false],
    ['', false],
    ['a@b.c', true]
  ];
  for (const [input, expected] of samples) {
    // Act
    const actual = isValidEmail(input);
    // Assert
    assert(actual === expected, `isValidEmail(${JSON.stringify(input)}) → ${actual}, expected ${expected}`);
  }
}

assert(typeof INVALID_EMAIL_MESSAGE === 'string' && INVALID_EMAIL_MESSAGE.length > 10, 'message present');

console.log('emailValidation tests passed');
