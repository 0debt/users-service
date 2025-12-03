import { createClient } from "@supabase/supabase-js"

//Para los tests
const isTest = process.env.TEST === "true" || process.env.CI === "true"

let supabase: any

if (isTest) {
  console.warn("Supabase desactivado en modo test/CI")
  
  supabase = {
    storage: {
      from() {
        return {
          upload: async () => ({ data: null, error: null })
        }
      }
    }
  }
} else {
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  )
}

export { supabase }
