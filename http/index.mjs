import arc from '@architect/functions'
export let handler = arc.http(fn)

async function fn (req) {
  return {
    html: 'hello from the arc-plugin-custom-domain plugin'
  }
}
