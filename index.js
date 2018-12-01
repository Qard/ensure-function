const realFs = require('fs')
const { resolve } = require('path')
const vm = require('vm')

const recast = require('recast')
const buildNode = recast.types.builders

function tryFunction (fn, args) {
  if (typeof fn === 'function') {
    if (fn.length >= args.length) {
      return fn
    } else {
      throw new Error('Not enough arguments')
    }
  }
}

// Check if a path is a direct child of th given parent
// This is useful for detecting top-level as child of ast.program
function childOf (path, parent) {
  return path.parentPath.parentPath.value === parent
}

function buildFunction (contents, args,options) {
  const ast = recast.parse(contents, options)

  let isExpression = false
  recast.visit(ast, {
    visitExpressionStatement (path) {
      if (childOf(path, ast.program)) {
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
      if (childOf(path, ast.program)) {
        const { id, params, body } = path.node
        // Expression-ify the function declaration
        const expression = buildNode.functionExpression(id, params, body)
        path.replace(buildNode.expressionStatement(expression))
        return false
      }
  
      this.traverse(path)
    },

    visitReturnStatement (path) {
      if (childOf(path, ast.program)) {
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

  const compiled = isExpression
    ? vm.compileFunction(code, args)
    : vm.runInThisContext(code)

  const fn = tryFunction(compiled, args)
  if (fn) return fn

  throw new Error('Could not determine valid function format')
}

function ensureFunction (maybeFunction, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    fs = realFs,
    parserOptions = {}
  } = options

  // Is it already a function?
  {
    const fn = tryFunction(maybeFunction, args)
    if (fn) return fn
  }

  // Is it a path to a file containing the function?
  const path = resolve(cwd, maybeFunction)
  const fileExists = fs.existsSync(path)
  if (!fileExists) return buildFunction(maybeFunction, args, parserOptions)

  // Is it amodule?
  let mod
  try {
    mod = require(path)
  } catch (err) {}

  {
    const fn = tryFunction(mod, args)
    if (fn) return fn
  }

  // Is it just a raw js file?
  const contents = fs.readFileSync(path).toString()
  return buildFunction(contents, args, parserOptions)
}

module.exports = ensureFunction