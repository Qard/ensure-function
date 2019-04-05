const realFs = require('fs')
const { resolve } = require('path')
const vm = require('vm')

const recast = require('recast')
const buildNode = recast.types.builders

const realRequire = require

function tryFunction (fn, args) {
  if (typeof fn === 'function') {
    if (fn.length >= args.length) {
      return fn
    } else {
      throw new Error('Not enough arguments')
    }
  }
}

// Check if a path is a direct child of the given parent
// This is useful for detecting top-level as child of ast.program
function childOf (path, parent) {
  return path.parentPath.parentPath.value === parent
}

function lastChild (path, parent) {
  if (!childOf(path, parent)) return false
  return parent.body[parent.body.length - 1] === path.node
}

function compileFunction (code, args, isExpression) {
  if (!isExpression) {
    return vm.runInThisContext(code)
  }

  // Only exists in Node.js 10+
  if (typeof vm.compileFunction === 'function') {
    return vm.compileFunction(code, args)
  }

  return vm.runInThisContext(
    `(function (${args.join(', ')}) {${code}})`
  )
}

function buildFunction (contents, args, options) {
  let compiled
  try {
    const ast = recast.parse(contents, options)

    let isExpression = false
    recast.visit(ast, {
      visitExpressionStatement (path) {
        if (lastChild(path, ast.program)) {
          const { expression } = path.node
          if (expression.type !== 'ArrowFunctionExpression') {
            path.replace(buildNode.returnStatement(path.node.expression))
            isExpression = true
            return false
          }
        }

        this.traverse(path)
      },

      // TODO: Only do this if the function declaration is the last node in the program body?
      visitFunctionDeclaration (path) {
        if (lastChild(path, ast.program)) {
          const { id, params, body } = path.node
          // Expression-ify the function declaration
          const expression = buildNode.functionExpression(id, params, body)
          path.replace(buildNode.expressionStatement(expression))
          return false
        }

        this.traverse(path)
      },

      visitReturnStatement (path) {
        if (lastChild(path, ast.program)) {
          const { argument } = path.node
          if (argument.type === 'FunctionExpression' || argument.type === 'ArrowFunctionExpression') {
            path.replace(buildNode.expressionStatement(argument))
            return false
          }
          isExpression = true
        }

        this.traverse(path)
      }
    })

    const { code } = recast.print(ast)

    compiled = compileFunction(code, args, isExpression)
  } catch (err) {
    const error = new Error('Failed to parse code')
    error.originalError = err
    throw error
  }

  return tryFunction(compiled, args)
}

function ensureFunction (maybeFunction, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    fs = realFs,
    require = realRequire,
    parserOptions = {}
  } = options

  // Is it already a function?
  {
    const fn = tryFunction(maybeFunction, args)
    if (fn) return fn
  }

  const path = resolve(cwd, maybeFunction)

  // Is it a module?
  let mod
  try {
    mod = require(path)
  } catch (err) { }

  {
    const fn = tryFunction(mod, args)
    if (fn) return fn
  }

  // Is it a path to a file containing the function?
  const fileExists = fs.existsSync(path)
  if (!fileExists) return buildFunction(maybeFunction, args, parserOptions)

  // Is it just a raw js file?
  const contents = fs.readFileSync(path).toString()
  return buildFunction(contents, args, parserOptions)
}

module.exports = ensureFunction
