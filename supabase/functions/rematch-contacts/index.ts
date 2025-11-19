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

      console.log(`Processing contact ${contact.id} with phone ${contact.contact_phone}`)

      // Find matching profile by phone number
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id, full_name, handle, phone_number')
        .eq('phone_number', contact.contact_phone)
        .neq('id', contact.user_id) // Don't match with self
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        console.error(`Error finding profile for contact ${contact.id}:`, profileError)
        continue
      }

      if (profile) {
        console.log(`Found match for contact ${contact.id}: profile ${profile.id}`)
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
          console.error(`Error updating contact ${contact.id}:`, updateError)
        } else {
          updatedCount++
          console.log(`Updated contact ${contact.id} with matched_user_id ${profile.id}`)
        }
      } else {
        // No match found - ensure is_matched is false
        if (contact.is_matched) {
          const { error: updateError } = await supabaseClient
            .from('contact_imports')
            .update({
              is_matched: false,
              matched_user_id: null
            })
            .eq('id', contact.id)

          if (updateError) {
            console.error(`Error updating unmatched contact ${contact.id}:`, updateError)
          } else {
            updatedCount++
            console.log(`Cleared match status for contact ${contact.id}`)
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
