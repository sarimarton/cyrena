import uniqueId from 'lodash/uniqueId'
import omit from 'lodash/fp/omit'
import clone from 'lodash/clone'
import mapValues from 'lodash/mapValues'

import { pragma, Fragment } from '../react/pragma'
import { makeCollection } from '@cycle/state'
import { powercycle, CONFIG } from '../powercycle'
import { resolveDotSeparatedScope } from './shortcuts'
import isolate from '@cycle/isolate'
import { get } from './index'

export const COLLECTION_DELETE =
  prevState => undefined

const getIndexInjectorLens = (idKey, indexKey) => ({
  get: state => state.map((record, idx) => {
    if (record[indexKey] !== undefined) {
      console.warn(
        `Powercycle Collection item already has an '${indexKey}' property. ` +
        `Choose another index key on the Collection by specifying the ` +
        `indexkey prop.`
      )
    }

    // Without this, the above warning always appear when a list item changes.
    // Not sure why it doesn't work in the setter. (But it doesn't.)
    const _record = clone(record)

    Object.defineProperty(_record, '$index', {
      get() { return idx },
      enumerable: false,
      configurable: true
    })

    return _record
  }),
  set: (state, childState) => {
    return childState.map(record => {
      Reflect.deleteProperty(record, indexKey);
      return record
    })
  }
})

const CollectionItem = sources =>
  powercycle(
    pragma(
      Fragment,
      null,
      sources.props.children
    ),
    null,
    sources
  )

export function Collection (sources) {
  const indexKey = sources.props.indexkey || '$index'
  const noIndex = sources.props.noindex || false
  const idKey = sources.props.idkey || 'id'
  const outerStateName = sources.props.outerstate || 'outerState'

  const List = [0]
    .map(() =>
      makeCollection({
        item: CollectionItem,

        // I'm not sure what it's for. From cycle's source, it seems like that it
        // serves as an isolation base, but we already have isolation on the items...
        // itemKey: (childState, index) => String(index),

        // channel: sources.props.channel || 'state',

        itemScope: sources.props.itemscope || (key => key),

        collectSinks: instances =>
          [clone(sources)]
            // pickMerge all channels found in sources except props and key...
            .map(omit(['props', 'key']))
            .map(sources => ({
              ...sources,
              [outerStateName]: 1
            }))
            .map(sources =>
              mapValues(
                sources,
                (src, channel) => instances.pickMerge(channel)
              )
            )
            // ...and pickCombine the vdom channel
            .map(sinks => ({
              ...sinks,
              [CONFIG.vdomProp]: instances
                .pickCombine(CONFIG.vdomProp)
                .map(itemVdoms =>
                  itemVdoms.map((vdom, idx) => ({
                    ...vdom,
                    key: String(idx)
                  }))
                )
            }))
          [0]
      })
    )

    // Inject $index properties in the items. This is not optional, because we
    // need an idKey for react vdom reasons (see CollectionItem), and we can
    // only check for their existense here. Injecting index into sources is
    // also not an alternative, because collection items run once, and sources
    // does not refresh. So for now, we have to live with this O(N) expense.
    .map(list =>
      noIndex
        ? list
        : isolate(list, {
            state: getIndexInjectorLens(idKey, indexKey)
          })
    )

    // Resolve 'for' prop. The 'for' prop has the same effect of 'scope', except
    // that it doesn't scope down the outerState stream in the items so they
    // can have full access to the outer state
    .map(list =>
      sources.props.for
        ? isolate(list, resolveDotSeparatedScope(sources.props.for))
        : list
    )

    // Add outerState to sources
    .map(list => sources => {
      const sinks = list({
        // de-proxy proxyfied sources object
        ...clone(sources),
        // It only works with streams, donno why
        [outerStateName]: sources.state.stream,
      })

      return {
        ...sinks,
        state: CONFIG.mergeFn([sinks.state, sinks[outerStateName]])
      }
    })

    // Wrap it in a fragment to prevent 'missing unique key' warning from react
    // in case of having adjacent elements to the Collection. makeCollection
    // generates a Context.Provider element, which can't have key.
    .map(list =>
      pragma(Fragment, null, pragma(list, null, sources.props.children))
    )
  [0]

  return List
}
