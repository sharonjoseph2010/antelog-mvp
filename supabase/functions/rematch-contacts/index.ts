import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log('Starting contact re-matching process...')

    // Get all contacts with phone numbers
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('contact_imports')
      .select('id, user_id, contact_phone, is_matched, matched_user_id')
      .not('contact_phone', 'is', null)

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError)
      throw contactsError
    }

    console.log(`Found ${contacts?.length || 0} contacts with phone numbers`)

    let matchedCount = 0
    let updatedCount = 0

    // Process each contact
    for (const contact of contacts || []) {
      if (!contact.contact_phone) continue

      console.log(`\n=== Processing contact ${contact.id} ===`)
      console.log(`  Name: ${contact.user_id}`)
      console.log(`  Original phone: "${contact.contact_phone}"`)

      // Get normalized version for debugging
      const { data: debugData, error: debugError } = await supabaseClient
        .rpc('normalize_phone_number', { phone_input: contact.contact_phone })

      if (!debugError && debugData) {
        console.log(`  Normalized phone: "${debugData}"`)
      }

      // Find matching profile using normalized phone comparison
      // This query uses the normalize_phone_number function to ensure matching works
      // regardless of format differences (spaces, leading zeros, etc.)
      const { data: profile, error: profileError } = await supabaseClient
        .rpc('find_profile_by_normalized_phone', {
          input_phone: contact.contact_phone,
          exclude_user_id: contact.user_id
        })
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        console.error(`  ❌ Error finding profile:`, profileError)
        continue
      }

      if (profile) {
        console.log(`  ✅ MATCH FOUND!`)
        console.log(`  → Profile ID: ${profile.id}`)
        console.log(`  → Name: ${profile.full_name}`)
        console.log(`  → Handle: @${profile.handle}`)
        console.log(`  → Profile phone: "${profile.phone_number}"`)
        matchedCount++

        // Update contact with match
        const { error: updateError } = await supabaseClient
          .from('contact_imports')
          .update({
            is_matched: true,
            matched_user_id: profile.id
          })
          .eq('id', contact.id)

        if (updateError) {
          console.error(`  ❌ Error updating contact:`, updateError)
        } else {
          updatedCount++
          console.log(`  ✅ Contact updated successfully`)
        }
      } else {
        console.log(`  ⚠️  No match found`)
        
        // No match found - ensure is_matched is false
        if (contact.is_matched) {
          console.log(`  → Clearing previous match status`)
          const { error: updateError } = await supabaseClient
            .from('contact_imports')
            .update({
              is_matched: false,
              matched_user_id: null
            })
            .eq('id', contact.id)

          if (updateError) {
            console.error(`  ❌ Error clearing match:`, updateError)
          } else {
            updatedCount++
            console.log(`  ✅ Match status cleared`)
          }
        }
      }
    }

    console.log(`Re-matching complete: ${matchedCount} matches found, ${updatedCount} contacts updated`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Re-matched contacts successfully`,
        stats: {
          totalProcessed: contacts?.length || 0,
          matchesFound: matchedCount,
          contactsUpdated: updatedCount
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in rematch-contacts function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
