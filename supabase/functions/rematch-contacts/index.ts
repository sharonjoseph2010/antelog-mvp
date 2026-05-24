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
      console.log(`📋 Contact name: ${contact.user_id}`)
      console.log(`📱 Original phone (as stored): "${contact.contact_phone}"`)

      // Get normalized version for debugging
      const { data: normalizedContactPhone, error: debugError } = await supabaseClient
        .rpc('normalize_phone_number', { phone_input: contact.contact_phone })

      if (debugError) {
        console.error(`❌ Error normalizing contact phone:`, debugError)
        continue
      }

      console.log(`🔄 Normalized contact phone: "${normalizedContactPhone}"`)

      // Get all profiles to check against with detailed logging
      console.log(`\n🔍 Searching for matching profiles...`)
      const { data: allProfiles, error: profilesError } = await supabaseClient
        .from('profiles')
        .select('id, full_name, handle, phone_number')
        .not('phone_number', 'is', null)
        .neq('id', contact.user_id)

      if (profilesError) {
        console.error(`❌ Error fetching profiles:`, profilesError)
        continue
      }

      console.log(`📊 Checking against ${allProfiles?.length || 0} profiles with phone numbers`)

      let foundMatch = false
      let matchedProfile = null

      // Check each profile for a match
      for (const profile of allProfiles || []) {
        const { data: normalizedProfilePhone } = await supabaseClient
          .rpc('normalize_phone_number', { phone_input: profile.phone_number })

        console.log(`\n  👤 Checking profile: ${profile.full_name} (@${profile.handle})`)
        console.log(`     Original phone (as stored): "${profile.phone_number}"`)
        console.log(`     Normalized phone: "${normalizedProfilePhone}"`)

        if (normalizedProfilePhone === normalizedContactPhone) {
          console.log(`     ✅ MATCH FOUND! Normalized phones are identical`)
          foundMatch = true
          matchedProfile = profile
          matchedCount++
          break
        } else {
          console.log(`     ❌ No match - normalized phones differ`)
          console.log(`        Contact: "${normalizedContactPhone}"`)
          console.log(`        Profile: "${normalizedProfilePhone}"`)
        }
      }

      if (foundMatch && matchedProfile) {
        console.log(`\n✅ Updating contact with match...`)
        console.log(`   → Matched to: ${matchedProfile.full_name} (@${matchedProfile.handle})`)
        
        // Update contact with match
        const { error: updateError } = await supabaseClient
          .from('contact_imports')
          .update({
            is_matched: true,
            matched_user_id: matchedProfile.id
          })
          .eq('id', contact.id)

        if (updateError) {
          console.error(`❌ Error updating contact:`, updateError)
        } else {
          updatedCount++
          console.log(`✅ Contact updated successfully`)
        }
      } else {
        console.log(`\n⚠️  No match found for this contact`)
        
        // No match found - ensure is_matched is false
        if (contact.is_matched) {
          console.log(`→ Clearing previous match status`)
          const { error: updateError } = await supabaseClient
            .from('contact_imports')
            .update({
              is_matched: false,
              matched_user_id: null
            })
            .eq('id', contact.id)

          if (updateError) {
            console.error(`❌ Error clearing match:`, updateError)
          } else {
            updatedCount++
            console.log(`✅ Match status cleared`)
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
