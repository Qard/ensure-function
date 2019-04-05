const tap = require('tap')
const ensureFunction = require('./')

function validateFunction (t, fn) {
  t.equal(typeof fn, 'function', 'returns a function')
  t.equal(fn.length, 1, 'has expected number of parameters')
  t.equal(fn({ value: 2 }), 4, 'maps to expected value')
  t.end()
}

tap.test('already a function', t => {
  const fn = ensureFunction(function map (item) {
    return item.value * 2
  }, ['item'])

  validateFunction(t, fn)
})

var tests = [
  {
    name: 'shorthand',
    contents: 'item.value * 2'
  },
  {
    name: 'shorthand with return',
    contents: 'return item.value * 2'
  },
  {
    name: 'basic function',
    contents: 'function map (item) { return item.value * 2 }'
  },
  {
    name: 'basic function with return',
    contents: 'return function map (item) { return item.value * 2 }'
  },
  {
    name: 'arrow function',
    contents: 'item => item.value * 2'
  },
  {
    name: 'arrow function with return',
    contents: 'return item => item.value * 2'
  },
  {
    name: 'internal function',
    contents: `
      function square (v) {
        return v * 2
      }

      function map (item) {
        return square(item.value)
      }
    `
  },
  {
    name: 'internal expression',
    contents: 'let multiple; multiple = 2; item.value * multiple'
  }
]

// Also verify multi-statement code functions correctly
tests.forEach(test => {
  tests.push({
    name: `multi-statement ${test.name}`,
    contents: `var scale = 2;${test.contents.replace(/2/, 'scale')}`
  })
})

tests.forEach(test => {
  const { name, contents } = test

  tap.test(`path ${name}`, t => {
    const fn = ensureFunction('map.js', ['item'], {
      fs: {
        existsSync () {
          return true
        },
        readFileSync () {
          return Buffer.from(contents)
        }
      }
    })
    validateFunction(t, fn)
  })

  tap.test(`module ${test.name}`, t => {
    const fn = ensureFunction('map.js', ['item'], {
      require (name) {
        return (item) => item.value * 2
      }
    })
    validateFunction(t, fn)
  })

  tap.test(`string ${test.name}`, t => {
    const fn = ensureFunction(contents, ['item'])
    validateFunction(t, fn)
  })
})

tap.test('multi-argument', t => {
  const fn = ensureFunction('(memo || 0) + item', ['memo', 'item'])
  t.equal(typeof fn, 'function', 'returns a function')
  t.equal(fn.length, 2, 'has expected number of parameters')
  t.equal([1, 2, 3].reduce(fn), 6, 'reduces to expected value')
  t.end()
})

tap.test('fail when expecting more arguments that function has', t => {
  t.throws(() => {
    ensureFunction('function map (item) { return item.value * 2 }', ['memo', 'item'])
  }, /^Not enough arguments/, 'should complain about arity')
  t.end()
})

tap.test('fail when file contents are invalid', t => {
  t.throws(() => {
    ensureFunction('map.js', ['memo', 'item'], {
      fs: {
        existsSync () {
          return true
        },
        readFileSync () {
          return Buffer.from('_Q)(**%&^*&R')
        }
      }
    })
  }, /^Failed to parse code$/, 'should fail to parse code')
  t.end()
})
