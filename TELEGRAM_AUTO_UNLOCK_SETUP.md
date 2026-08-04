# របៀបដំឡើង Telegram Auto-Unlock

## អ្វីដែលបានផ្លាស់ប្តូរក្នុងកូដ

1. **Migration ថ្មី**: `supabase/migrations/20260805120000_telegram_auto_confirm.sql`
   បន្ថែម column `match_code` (កូដ ៦ តួខ្លីៗ ដែលបង្កើតដោយស្វ័យប្រវត្តិ) ទៅតារាង `subscription_requests`។

2. **Edge Function ថ្មី**: `supabase/functions/telegram-webhook/index.ts`
   ទទួលសារពី Telegram group ដែល ABA Merchant ផ្ញើ notification ចូល, រកកូដ/ចំនួនប្រាក់ ហើយ unlock ស្វ័យប្រវត្តិ។

3. **`SubscriptionModal.tsx`**: ពេលអ្នកប្រើចុច "ទូទាត់", app បង្កើត request ភ្លាមៗ (មិនទាន់ទូទាត់) ហើយបង្ហាញកូដ ៦ តួខាងក្រោម QR ។ អ្នកប្រើត្រូវចម្លងកូដនេះទៅដាក់ក្នុងប្រអប់ "Message / Note" ពេលទូទាត់ក្នុង ABA Mobile ។ ប៊ូតុង "Upload Receipt" (OCR) នៅតែមាននៅសល់ ជាផ្លូវបម្រុងទុក ប្រសិនបើអ្នកភ្លេចដាក់កូដ។

## ជំហានដំឡើង (ធ្វើតែម្តង)

### ១. Deploy migration + function ទៅ Supabase
```bash
supabase db push
supabase functions deploy telegram-webhook
```

### ២. រៀបចំ Bot ក្នុង Telegram
1. បើក **@BotFather** → `/setprivacy` → ជ្រើសរើស bot របស់អ្នក → **Disable**
   (ចាំបាច់! បើមិន disable ទេ bot នឹងឃើញតែសារដែល @mention វា ឬជា command ប៉ុណ្ណោះ មិនឃើញសារ notification ពី ABA ទេ)
2. បន្ថែម bot របស់អ្នកចូលទៅ **ក្រុម Telegram ដដែល** ដែល ABA Merchant ផ្ញើសារជូនដំណឹងចូល (ក្រុមក្នុងរូបភាពទី៣)
3. យក **Bot Token** ពី BotFather (command `/mybots` → ជ្រើសរើស bot → API Token)

### ៣. តភ្ជាប់ Webhook
ជំនួស `<TOKEN>`, `<PROJECT_REF>`, និងជ្រើសរើស secret ដោយខ្លួនឯង (លេខចៃដន្យវែងណាមួយ):
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<A-LONG-RANDOM-SECRET-YOU-PICK>"
```

### ៤. កំណត់ Environment Variables (Supabase → Edge Functions → Secrets)
```
TELEGRAM_WEBHOOK_SECRET = <same secret as step 3>
TELEGRAM_BOT_TOKEN      = <token from BotFather, optional — for confirm replies>
```
កុំទាន់កំណត់ `TELEGRAM_GROUP_ID` និង `ABA_NOTIFIER_ID` ឥឡូវនេះ — ធ្វើតាមជំហានទី៥ជាមុនសិន។

### ៥. រកលេខ Group ID និង ABA Sender ID (សំខាន់ណាស់សម្រាប់សុវត្ថិភាព)
ដោយគ្មានពីរតម្លៃនេះ Telegram webhook នឹង **ជឿរាល់សារទាំងអស់ក្នុងក្រុម** — មានន័យថា នរណាម្នាក់ក្នុងក្រុមអាចវាយសារក្លែងក្លាយ "បានទូទាត់ជោគជ័យ" ដើម្បី unlock ដោយឥតគិតថ្លៃ។ ដូច្នេះត្រូវរកតម្លៃទាំងពីរនេះឲ្យបាន៖

1. ធ្វើតេស្តទូទាត់ចំនួនតូចមួយ (ឬចាំ ABA ផ្ញើ notification ណាមួយចូលក្រុម)
2. បើក Supabase Dashboard → Edge Functions → `telegram-webhook` → Logs
3. រកជួរ `telegram-webhook update: {...}` ហើយមើល:
   - `message.chat.id` → នេះជា **TELEGRAM_GROUP_ID**
   - `message.from.id` (គណនី/bot ណាដែលផ្ញើសារ notification នោះ) → នេះជា **ABA_NOTIFIER_ID**
4. ដាក់តម្លៃទាំងពីរនេះជា Secrets ក្នុង Supabase (ដូចជំហានទី៤)
5. Deploy ម្តងទៀត៖ `supabase functions deploy telegram-webhook`

## របៀបដំណើរការ

1. អ្នកប្រើជ្រើសរើសគម្រោង → ចុច "ទូទាត់" → app បង្កើត request pending + បង្ហាញកូដ ៦ តួ (ឧ. `A1B2C3`)
2. អ្នកប្រើស្កេន QR ក្នុង ABA Mobile ហើយ **វាយកូដ `A1B2C3` ក្នុងប្រអប់ Message/Note** មុននឹងបញ្ជាក់ការទូទាត់
3. ABA ផ្ញើ notification ចូលក្រុម Telegram (ជាធម្មតារួមទាំង note ដែលបានវាយ)
4. Bot របស់អ្នកឃើញសារនោះ → រកឃើញកូដ `A1B2C3` ដែលផ្គូផ្គងជាមួយ request តែមួយប៉ុណ្ណោះ → unlock ស្វ័យប្រវត្តិភ្លាមៗ
5. ផ្ទាំង app (កំពុងបើក "រង់ចាំការបញ្ជាក់") ដែល poll រៀងរាល់ ១៥ វិនាទី នឹងឃើញ status ប្តូរទៅ `confirmed` ហើយបង្ហាញ "ជោគជ័យ" ភ្លាមៗ

បើសារ ABA មិនមានចន្លោះឲ្យវាយ note ទេ (អាស្រ័យលើ UI ABA Mobile កំណែថ្មីៗ), ប្រព័ន្ធនៅតែសាកល្បងផ្គូផ្គងតាមចំនួនប្រាក់ + ពេលវេលា (២០ នាទីចុងក្រោយ) ជាជម្រើសបម្រុង — ប៉ុន្តែបើមានពីរនាក់បង់ចំនួនដូចគ្នាក្នុងពេលជិតគ្នា វានឹងមិន auto-confirm ទេ (ដើម្បីសុវត្ថិភាព) ហើយនៅតែធ្លាក់ទៅ manual review ដូចមុន។

## សុវត្ថិភាព
- Webhook ត្រូវការ `secret_token` ត្រឹមត្រូវ (Telegram ផ្ញើមកជា header) បើមិនត្រូវ វា reject ភ្លាមៗ
- បើ `TELEGRAM_GROUP_ID` និង `ABA_NOTIFIER_ID` ត្រូវបានកំណត់ វានឹងច្រានចោលរាល់សារពីក្រៅក្រុមនោះ ឬពីអ្នកផ្សេងក្រៅពី ABA
- វា **មិនដែល** downgrade ឬ bypass status ពី 'confirmed' ត្រឡប់ទៅវិញទេ — គ្រាន់តែ 'pending' → 'confirmed' តែម្តងប៉ុណ្ណោះ
