import clone from 'lodash/clone'
import _get from 'lodash/get'

// Power-ups the sources object to make all these shorthands available:
// sources.react.select('input').events('change').map(ev => ev.target.value)
// sources.sel.input.events('change').map(ev => ev.target.value)
// sources.sel.input.change.map(ev => ev.target.value)
// sources.sel.input.change['target.value']
const eventsProxy = (target, prop) => {
  const selector = typeof prop === 'symbol' && Symbol.keyFor(prop) || prop

  return new Proxy(target.react.select(selector), {
    get: (target, prop) =>
      target[prop] ||
      new Proxy(target.events(prop), {
        get: (target, prop) =>
          target[prop] ||
          target.map(ev => _get(ev, prop))
      })
  })
}

export const sel = name => Symbol.for(name)

export function powerUpSources (sources) {
  return new Proxy(sources, {
    get: (target, prop) => {
      return prop === 'sel' && !target[prop]
        ? new Proxy({}, {
            get: (dummy, prop) => eventsProxy(target, prop)
          })
        : typeof prop === 'symbol'
          ? eventsProxy(target, prop)
          : target[prop]
    }
  })
}

export const depowerSources = clone
