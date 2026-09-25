import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendKey = Deno.env.get('RESEND_API_KEY')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    if (!resendKey) {
      return new Response(
        JSON.stringify({ message: 'Email service not configured. Set RESEND_API_KEY to enable reminders.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0]

    interface ReminderRow {
      email: string
      pet_name: string
      title: string
      type: string
      date: string
      time: string
    }

    // Get tomorrow's appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select(`
        title, type, date, time,
        pets!inner(name, family_id),
        family_members!inner(email)
      `)
      .eq('date', tomorrowStr)

    const reminders: ReminderRow[] = []

    for (const appt of (appts ?? []) as any[]) {
      const petName = appt.pets?.name
      for (const member of (appt.family_members ?? [])) {
        if (member.email) {
          reminders.push({
            email: member.email,
            pet_name: petName,
            title: appt.title,
            type: appt.type,
            date: appt.date,
            time: appt.time,
          })
        }
      }
    }

    // Get vaccinations due tomorrow
    const { data: vax } = await supabase
      .from('vaccinations')
      .select(`
        vaccine_name, next_due_date,
        pets!inner(name, family_id),
        family_members!inner(email)
      `)
      .eq('next_due_date', tomorrowStr)

    for (const v of (vax ?? []) as any[]) {
      const petName = v.pets?.name
      for (const member of (v.family_members ?? [])) {
        if (member.email) {
          reminders.push({
            email: member.email,
            pet_name: petName,
            title: `${v.vaccine_name} booster`,
            type: 'vaccination',
            date: v.next_due_date,
            time: '09:00',
          })
        }
      }
    }

    if (reminders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No reminders to send today.', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send emails via Resend
    let sentCount = 0
    for (const reminder of reminders) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'PetPal <noreply@resend.dev>',
            to: reminder.email,
            subject: `Reminder: ${reminder.title} for ${reminder.pet_name} tomorrow`,
            html: `
              <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #16a34a;">PetPal Reminder</h2>
                <p>Hi there,</p>
                <p>This is a reminder that <strong>${reminder.title}</strong> for <strong>${reminder.pet_name}</strong> is scheduled for tomorrow.</p>
                <div style="background: #f0f9f4; padding: 16px; border-radius: 12px; margin: 16px 0;">
                  <p style="margin: 0;"><strong>Type:</strong> ${reminder.type}</p>
                  <p style="margin: 4px 0 0;"><strong>Date:</strong> ${reminder.date}</p>
                </div>
                <p style="color: #666; font-size: 14px;">— Sent from PetPal</p>
              </div>
            `,
          }),
        })

        if (emailResponse.ok) sentCount++
      } catch (err) {
        console.error(`Failed to send to ${reminder.email}:`, err)
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sentCount} of ${reminders.length} reminders.`, sent: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-reminders error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to process reminders.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
