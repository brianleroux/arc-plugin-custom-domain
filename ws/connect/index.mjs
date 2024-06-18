import arc from '@architect/functions'
export let handler = arc.http(fn)

async function fn (req) {
  console.log(req)
  return {
    html: 'hi'
  }
}
