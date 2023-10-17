import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import { parse } from "https://deno.land/x/xml/mod.ts"
import { corsHeaders } from '../_shared/corsHeaders.ts'

console.log("edge_rss function starts")

type TPayload = {
  ids:number[],
  jobId:number
}

type TSupabaseResult = {
  data:any
  error:any
}

type TRss = {
  id: number
  url: string
  title: string
  description: string
  last_build_date: string|null
}

type TRssItem = {
  guid: number
  rss_id: number
  title: string
  link: string
  description: string
  pub_date: string|null
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
const supabaseClient = createClient(supabaseUrl, supabaseKey)

const getRssInfos = async (input:TPayload):Promise<TRss[]> => {
  let response:TSupabaseResult

  if(input.jobId) {
    response = await supabaseClient.from("rss").select("*").eq("job_id", input.jobId)
  }
  else {
    if(input.ids && input.ids.length > 0)
    {
      response = await supabaseClient.from("rss").select("*").in("id", input.ids)
    }
    else {
      response = await supabaseClient.from("rss").select("*")
    }
  }

  if(response.error)
  {
    console.log(response.error.message)
  }

  return response.data;  
}

const uploadRss = (rss:TRss, rssItems:TRssItem[]) => {
  supabaseClient.from("rss").upsert(rss).select().then((result) => { if(result.error) console.log(result.error)})  

  supabaseClient.from("rss_items").upsert(rssItems).select().then((result) => { 
    console.log(`Uploaded ${rss.id}: ${rss.url}. ${result.error?.message ?? ""}`)
  });
}

const mapFromRss = (rss:TRss, input:any):{rss:TRss, rssItems:TRssItem[]} => {
  rss.title = input.channel.title, 
  rss.description = input.channel.description, 
  rss.last_build_date = input.channel.lastBuildDate ? (new Date(input.channel.lastBuildDate)).toISOString() : null 

  const rssItems:TRssItem[] = input.channel.item.map((item:any) => 
    ({
      guid: getItemGuid(item), 
      rss_id: rss.id,
      title: item.title,
      link: item.link,
      description: item.description,
      pub_date: item.pubDate ? (new Date(item.pubDate)).toISOString() : null
    })
  )  
  return {rss, rssItems}
}

const mapFromFeed = (rss:TRss, input:any):{rss:TRss, rssItems:TRssItem[]} => {
  rss.title = input.title, 
  rss.last_build_date = input.updated ? (new Date(input.updated)).toISOString() : null 

  const rssItems:TRssItem[] = input.entry.map((item:any) => 
    ({
      guid: item.id,
      rss_id: rss.id,
      title: item.title,
      link: item.link['@href'],
      description: item.content['#text'],
      pub_date: item.updated ? (new Date(item.updated)).toISOString() : null
    })
  )  
  return {rss, rssItems}
}

const downloadRss = (rssInfos:TRss[]) => {
  if(rssInfos) {
    rssInfos.map((info) => {
      fetch(info.url)
      .then(response => response.text())
      .then(xml => parse(xml))
      .then(json => {
        let rssItems:TRssItem[] = []
        let rss:TRss = info
        if("rss" in json) {
          ({rss, rssItems} = mapFromRss(info, json.rss))
        } 
        else if("feed" in json)
        {
          ({rss, rssItems} = mapFromFeed(info, json.feed))
        }

        uploadRss(rss, rssItems)
      })   
      .catch(ex => {
        console.log((ex as Error).message)
      })
    })
  }
}

const getItemGuid = (item:any) => {
  if ("guid" in item)
  {
    return item.guid["#text"] ?? item.guid    
  }
  else
  {
    return item.link
  }
}

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const input:TPayload = await req.json()
    
    console.log(`Input: ${JSON.stringify(input)}`)
  
    if(input.jobId || input.ids)
    {
      const rssInfos:TRss[] = await getRssInfos(input)
  
      console.log(`found ${rssInfos.length} infos`)
    
      downloadRss(rssInfos)
    
      console.log("edge_rss function returned")
    
      return new Response(
        JSON.stringify({response: "Success"}),
        { headers: { "Content-Type": "application/json" } },
      )
    }
  
    return new Response(
      JSON.stringify({response: "Job aborted. No input parameter found."}),
      { headers: { "Content-Type": "application/json" } },
    )
  } 
  catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})