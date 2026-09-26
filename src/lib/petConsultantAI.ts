import type { Pet } from '@/types'
import { hasGeminiApiKey, getGeminiConsultantChat } from './gemini'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  category?: 'adoption' | 'symptoms' | 'nutrition' | 'training' | 'general'
  isEmergency?: boolean
  suggestedActions?: Array<{
    label: string
    actionType: 'navigate_calendar' | 'navigate_checklist' | 'prompt'
    payload?: string
  }>
}

/**
 * AI Pet Care Consultant Engine
 * Uses Google Gemini (gemini-2.5-flash) when API key is present,
 * with comprehensive veterinary-informed fallback.
 */
export async function getPetConsultantResponse(
  query: string,
  selectedPet?: Pet | null,
  allPets?: Pet[],
  chatHistory: ChatMessage[] = []
): Promise<{
  content: string
  category: 'adoption' | 'symptoms' | 'nutrition' | 'training' | 'general'
  isEmergency: boolean
  suggestedActions?: Array<{
    label: string
    actionType: 'navigate_calendar' | 'navigate_checklist' | 'prompt'
    payload?: string
  }>
}> {
  const cleanQuery = query.trim()
  const lower = cleanQuery.toLowerCase()

  // 1. If Gemini API key is available, use Google Gemini AI
  if (hasGeminiApiKey()) {
    try {
      const geminiResult = await getGeminiConsultantChat(
        cleanQuery,
        selectedPet,
        allPets,
        chatHistory
      )
      return geminiResult
    } catch (err) {
      console.warn('Gemini chat request failed, falling back to local engine:', err)
    }
  }

  // Fallback: local expert consultant engine
  await new Promise((resolve) => setTimeout(resolve, 500))

  const petContext = selectedPet
    ? `Regarding ${selectedPet.name} (${selectedPet.breed ? `${selectedPet.breed} ` : ''}${selectedPet.species}${selectedPet.weight ? `, ${selectedPet.weight}kg` : ''}):`
    : ''

  // 1. EMERGENCY / CRITICAL SYMPTOM DETECTION
  const emergencyKeywords = [
    'chocolate', 'grape', 'raisin', 'xylitol', 'lily', 'lilies', 'rat poison', 'antifreeze',
    'pale gums', 'blue gums', 'bloat', 'swollen stomach', 'hard stomach', 'unconscious',
    'seizure', 'cannot breathe', 'difficulty breathing', 'gasping', 'hit by car', 'bleeding heavily',
    'choking', 'paralyzed', 'cannot walk suddenly', 'straining to urinate cat'
  ]

  const isEmergency = emergencyKeywords.some((kw) => lower.includes(kw))

  if (isEmergency) {
    let specificDanger = 'a potential veterinary emergency'
    if (lower.includes('chocolate')) specificDanger = 'chocolate ingestion (Theobromine toxicity)'
    else if (lower.includes('grape') || lower.includes('raisin')) specificDanger = 'grape or raisin ingestion (acute kidney failure risk)'
    else if (lower.includes('xylitol') || lower.includes('gum')) specificDanger = 'Xylitol / birch sugar ingestion (severe hypoglycemia & liver failure risk)'
    else if (lower.includes('lily') || lower.includes('lilies')) specificDanger = 'lily exposure for cats (acute fatal kidney toxicity)'
    else if (lower.includes('bloat') || lower.includes('hard stomach')) specificDanger = 'possible GDV / Gastric Dilatation-Volvulus (Bloat)'
    else if (lower.includes('straining to urinate')) specificDanger = 'urinary blockage (life-threatening in felines)'

    return {
      category: 'symptoms',
      isEmergency: true,
      content: `🚨 **URGENT VETERINARY ALERT: SEEK IMMEDIATE MEDICAL CARE**

Based on your description, this indicates **${specificDanger}**, which is a life-threatening medical emergency.

### Immediate Actions:
1. **Call Your Nearest Vet or 24/7 Animal Emergency Hospital immediately.** Do not wait to see if symptoms improve.
2. **Keep Your Pet Calm and Warm.** Minimize movement, especially if in shock or pain.
3. **Do NOT induce vomiting** unless explicitly instructed by a licensed veterinarian (some toxins cause severe esophageal damage coming back up).
4. **Bring the packaging or sample** (e.g. food wrapper, plant, or chemical container) with you so the veterinary team knows the exact substance and dosage.

${selectedPet ? `> **Pet Record**: ${selectedPet.name} (${selectedPet.species}${selectedPet.breed ? `, ${selectedPet.breed}` : ''})` : ''}

> ⚠️ *Time is critical. Please take your pet to the nearest emergency clinic right away.*`,
      suggestedActions: [
        { label: '📅 Schedule Follow-up in Calendar', actionType: 'navigate_calendar' },
        { label: '📋 View Emergency Checklists', actionType: 'navigate_checklist' },
      ],
    }
  }

  // 2. ADOPTION CONSULTATION ("want to adopt a dog / cat", "what do i need to know", "first time pet")
  if (
    lower.includes('adopt') ||
    lower.includes('getting a dog') ||
    lower.includes('getting a puppy') ||
    lower.includes('getting a cat') ||
    lower.includes('what i need to know') ||
    lower.includes('first time dog') ||
    lower.includes('first time pet') ||
    lower.includes('preparation')
  ) {
    const isCat = lower.includes('cat') || lower.includes('kitten')

    if (isCat) {
      return {
        category: 'adoption',
        isEmergency: false,
        content: `🐱 **Congratulations on Considering Cat Adoption! Here is Your Complete Guide**

Adopting a cat brings immense joy and affection. Here is everything you need to know as a prospective cat parent:

### 1. Essential Preparation Checklist:
* **Litter Box Setup**: Rule of thumb is *Number of Cats + 1* boxes. Use unscented clumping litter and place in quiet, accessible areas.
* **Nutrition & Hydration**: High-protein wet & dry food, stainless steel or ceramic food bowls, and a water fountain (cats naturally prefer running water).
* **Scratching & Climbing**: Vertical scratching posts (sisal or corrugated cardboard) and a cat tree or window perch.
* **Safety First**: Ensure window screens are secure and remove toxic houseplants (especially **Lilies**, Pothos, and Philodendron).

### 2. The "3-3-3 Rule" for Adopted Cats:
* **First 3 Days**: Decompressing. Keep them in a quiet "safe room" with food, water, and litter. They may hide initially.
* **First 3 Weeks**: Learning your routine, exploring the rest of your home, and showing their true personality.
* **First 3 Months**: Fully trusting and bonded to you and their environment.

### 3. Key Financial & Healthcare Considerations:
* Core vaccines (FVRCP combo, Rabies) & microchipping.
* Annual preventative exams, dental care, and spay/neuter.
* Budget for quality food, parasite prevention (flea/tick/heartworm), and an emergency fund.

Would you like advice on choosing between a kitten vs an adult cat, or introducing a cat to other pets?`,
        suggestedActions: [
          { label: '📋 Create Cat Prep Checklist', actionType: 'navigate_checklist' },
          { label: '🐾 Ask: Kitten vs Adult Cat?', actionType: 'prompt', payload: 'What are the pros and cons of adopting a kitten versus an adult cat?' },
        ],
      }
    }

    // Dog adoption guide
    return {
      category: 'adoption',
      isEmergency: false,
      content: `🐕 **Thinking of Adopting a Dog? Here is Your Complete Pet Consultant Guide**

Adopting a dog is a wonderful, 10–15+ year commitment that transforms your life. Here is the foundational blueprint to prepare:

### 1. Finding the Right Match for Your Lifestyle:
* **Energy Level**: Match your daily routine. High-energy breeds (Border Collies, Huskies, Shepherds) need 1.5–2 hours of vigorous exercise daily. Moderate/low energy dogs (Greyhounds, French Bulldogs, Senior rescues) thrive on shorter strolls and couch cuddles.
* **Living Space**: Smaller apartments suit dogs that don't need sprawling backyards, provided they get regular potty walks and mental stimulation.
* **Time Commitment**: Dogs need companionship, potty breaks every 4–6 hours (more for puppies), and mental enrichment.

### 2. Essential Adoption Supplies Checklist:
* **Walking & Safety**: Secure Y-shaped no-pull harness, 6ft fixed leash (avoid retractables), collar with ID tags, and microchip registration.
* **Comfort & Sleep**: Orthopedic dog bed, appropriately sized crate with cozy blanket.
* **Feeding**: High-quality complete dog food appropriate for their life stage, stainless steel bowls.
* **Mental Enrichment**: KONG chew toys, lick mats, puzzle feeders, and natural chew sticks.

### 3. The "3-3-3 Rule" of Dog Adoption:
* **First 3 Days**: Overwhelmed and decompressing. Keep the environment quiet, stick to a predictable routine, and avoid having multiple guests over.
* **First 3 Weeks**: Settling in, testing boundaries, and learning your daily household rhythm.
* **First 3 Months**: Building deep trust, feeling secure in their forever home, and forming true loyalty.

### 4. Ongoing Budget Expectations:
* Monthly: Quality food ($50–$100), flea/tick/heartworm prevention ($25–$40), toys/treats ($20–$40).
* Annual: Wellness vet exam & vaccines ($150–$300), pet insurance ($30–$70/mo).

Do you have a specific breed or size in mind, or would you like help evaluating shelter dogs?`,
      suggestedActions: [
        { label: '📋 Create Dog Adoption Checklist', actionType: 'navigate_checklist' },
        { label: '🐾 Ask: Best Breeds for First-Time Owners?', actionType: 'prompt', payload: 'What are the best dog breeds for first-time owners in an apartment?' },
        { label: '💰 Ask: Budgeting for a Dog', actionType: 'prompt', payload: 'What are the total first-year costs of adopting a dog?' },
      ],
    }
  }

  // 3. SYMPTOM CONSULTATION ("not eating", "lethargic", "vomiting", "diarrhea", "coughing", "limping", "scratching")
  if (
    lower.includes('symptom') ||
    lower.includes('not eating') ||
    lower.includes('lethargic') ||
    lower.includes('vomit') ||
    lower.includes('throw up') ||
    lower.includes('diarrhea') ||
    lower.includes('loose stool') ||
    lower.includes('cough') ||
    lower.includes('limp') ||
    lower.includes('scratching') ||
    lower.includes('itchy') ||
    lower.includes('ear') ||
    lower.includes('eye') ||
    lower.includes('sick')
  ) {
    const petName = selectedPet?.name || 'your pet'
    const species = selectedPet?.species || 'pet'

    if (lower.includes('not eating') || lower.includes('lethargic')) {
      return {
        category: 'symptoms',
        isEmergency: false,
        content: `🩺 **Pet Consultant Symptom Evaluation: Inappetence & Lethargy in ${petName}**

${petContext}

Loss of appetite combined with low energy is one of the most common non-specific signs in ${species}s that warrants careful monitoring.

### 1. Assess the Severity (Triage):
* 🔴 **See Vet Immediately If**:
  - Gums are pale, tacky, or yellowish.
  - Refusing water for more than 12–18 hours (high dehydration risk).
  - Accompanied by repeated vomiting, fever (ears/paws feeling very hot), or whimpering in abdominal pain.
* 🟡 **Schedule Vet Visit Within 24 Hours If**:
  - Fully skips all meals for > 24 hours (for dogs) or > 24–36 hours (for cats, as cats risk hepatic lipidosis / fatty liver disease).
  - Lingering sluggishness with no signs of bounce-back.
* 🟢 **Mild / Home Observation (Under 12-24h)**:
  - If they recently received vaccinations (mild fatigue is common for 24 hours).
  - Minor stomach upset after eating something unusual outside.

### 2. Supportive Home Care While Monitoring:
1. **Check Hydration**: Gently pinch the skin on the back of their neck. It should snap back instantly. If it stays tented, they are dehydrated.
2. **Offer Bland, Palatable Food**:
   - For Dogs: Boiled plain chicken breast with white rice (no salt, onions, or oil).
   - For Cats: Warm plain wet food or low-sodium bone broth (garlic/onion free).
3. **Record Daily Notes**: Keep track of when they last drank water, urinated, or had a bowel movement to share with your vet.

> ℹ️ *Consultant Note: This guidance is for educational triage. If ${petName}'s condition worsens, please contact your veterinarian promptly.*`,
        suggestedActions: [
          { label: '📅 Schedule Vet Appointment', actionType: 'navigate_calendar' },
          { label: '💊 Check Care Checklist', actionType: 'navigate_checklist' },
          { label: '🐾 Ask: How to Check Pet Temperature', actionType: 'prompt', payload: 'How can I safely check if my pet has a fever at home?' },
        ],
      }
    }

    if (lower.includes('vomit') || lower.includes('diarrhea')) {
      return {
        category: 'symptoms',
        isEmergency: false,
        content: `🩺 **Pet Consultant Symptom Evaluation: Digestive Upset (Vomiting / Diarrhea) in ${petName}**

${petContext}

Digestive upset is frequent in ${species}s and can range from dietary indiscretion to infections or parasites.

### 1. Triage Signs:
* 🔴 **Red Flags (Seek Vet Right Away)**:
  - Blood present in vomit (bright red or dark coffee-ground texture) or stool (black tarry or bloody jelly).
  - Lethargy, collapse, or inability to keep water down.
  - Unproductive retching (trying to throw up with nothing coming out — potential bloat emergency).
* 🟢 **Mild Dietary Indiscretion (Can Monitor for 12–24h)**:
  - Active energy, alert eyes, drank a little water, no repeated vomiting.

### 2. Recommended Home Care Protocol:
1. **Rest the Digestive Tract**:
   - Withhold solid food for 4–6 hours (do NOT withhold water for more than 2 hours; provide small frequent sips).
2. **Introduce a 48-Hour Bland Diet**:
   - 2:1 ratio of boiled white rice to boiled shredded chicken breast (skinless/boneless).
   - Feed small portions 3–4 times throughout the day instead of large meals.
3. **Probiotics**: A veterinary-grade canine or feline probiotic (e.g. FortiFlora or Pro-Pectalin) can restore gut flora.
4. **Transition Back**: Gradually mix regular kibble back into the bland diet over 3–4 days once stool firms up.`,
        suggestedActions: [
          { label: '📅 Book Vet Checkup', actionType: 'navigate_calendar' },
          { label: '🐾 Ask: Bland Diet Recipe', actionType: 'prompt', payload: 'What is the exact recipe and portion size for a dog bland diet?' },
        ],
      }
    }

    if (lower.includes('scratch') || lower.includes('itchy') || lower.includes('ear')) {
      return {
        category: 'symptoms',
        isEmergency: false,
        content: `🩺 **Pet Consultant Evaluation: Scratching, Itching & Ear Care for ${petName}**

${petContext}

Excessive scratching or head-shaking usually stems from one of four primary culprits:

### 1. Common Causes:
1. **Ear Infections (Otitis)**: Look inside the ear flap. Is there dark brown/yellow discharge, a sour yeasty smell, or redness? Head shaking and tilting are hallmark signs.
2. **Flea Allergy Dermatitis**: Even a single flea bite can trigger intense itching, especially near the base of the tail and groin. Check for "flea dirt" (tiny black pepper specks).
3. **Environmental or Food Allergies**: Paw licking, red belly, and seasonal flare-ups often indicate pollen, grass, dust mites, or chicken/beef protein sensitivities.
4. **Dry Skin / Contact Dermatitis**: Harsh shampoos or dry indoor heating.

### 2. Recommended Action Steps:
* **Do NOT clean irritated ears with vinegar, alcohol, or human drops** — this causes severe stinging if the eardrum is inflamed.
* Ensure up-to-date monthly flea & tick preventative.
* Schedule a quick vet swab: Vet ear cytology takes 10 minutes and identifies whether it's yeast or bacteria, ensuring the correct medicated drops (e.g. Posatex, Claro, Otomax).`,
        suggestedActions: [
          { label: '📅 Book Ear Exam in Calendar', actionType: 'navigate_calendar' },
          { label: '🐾 Ask: Best Flea Preventatives', actionType: 'prompt', payload: 'What are the most effective vet-recommended flea and tick preventatives?' },
        ],
      }
    }
  }

  // 4. NUTRITION & TOXIC FOOD CONSULTATION
  if (
    lower.includes('food') ||
    lower.includes('eat') ||
    lower.includes('diet') ||
    lower.includes('nutrition') ||
    lower.includes('toxic') ||
    lower.includes('safe') ||
    lower.includes('peanut butter') ||
    lower.includes('banana') ||
    lower.includes('apple')
  ) {
    return {
      category: 'nutrition',
      isEmergency: false,
      content: `🍎 **Pet Nutrition & Food Safety Guide**

${petContext}

Proper nutrition is the cornerstone of lifelong vitality. Here is your quick reference guide for safe treats vs dangerous toxic foods:

### 🚫 STRICTLY TOXIC FOODS (Never Feed!):
* **Xylitol / Birch Bark Extract**: Found in sugar-free peanut butter, gums, baked goods. Causes rapid fatal hypoglycemia & liver failure.
* **Chocolate, Cocoa & Caffeine**: Theobromine toxicity causes heart arrhythmias, tremors, and seizures.
* **Grapes & Raisins**: Highly toxic even in tiny amounts; triggers acute kidney failure.
* **Onions, Garlic, Chives & Leeks**: Damages red blood cells, causing severe hemolytic anemia.
* **Macadamia Nuts**: Causes weakness, tremors, and hyperthermia.
* **Lilies (Cats)**: Even licking pollen causes acute kidney failure within 24–72 hours.
* **Cooked Bones**: Splinters easily, causing internal punctures and gastrointestinal blockage.

### 🍏 HEALTHY & SAFE HUMAN FOOD TREATS:
* **Plain Pumpkin Puree**: Fantastic source of soluble fiber for firming loose stool or relieving constipation.
* **Carrots & Green Beans**: Low-calorie, crunch satisfying, great for teeth.
* **Apples (Seedless)** & **Blueberries**: Packed with antioxidants and vitamins.
* **Boiled Lean Chicken & Turkey**: Great high-protein treat or training reward.
* **Natural Peanut Butter**: Only 100% pure peanuts (always check label: ZERO xylitol).

### 💡 Golden Feeding Rule:
Treats should make up no more than **10%** of your pet's daily caloric intake. The other 90% should come from complete, balanced veterinary-approved pet food.`,
      suggestedActions: [
        { label: '📋 View Daily Feeding Routines', actionType: 'navigate_checklist' },
        { label: '🐾 Ask: How Much Food per Day?', actionType: 'prompt', payload: 'How do I calculate the exact daily calorie and food portion for my pet?' },
      ],
    }
  }

  // 5. BEHAVIOR & TRAINING CONSULTATION
  if (
    lower.includes('train') ||
    lower.includes('bark') ||
    lower.includes('potty') ||
    lower.includes('crate') ||
    lower.includes('bite') ||
    lower.includes('biting') ||
    lower.includes('leash') ||
    lower.includes('anxiety') ||
    lower.includes('behavior') ||
    lower.includes('puppy')
  ) {
    const petName = selectedPet?.name || 'your pet'

    return {
      category: 'training',
      isEmergency: false,
      content: `🎾 **Pet Consultant Behavior & Training Guide for ${petName}**

${petContext}

Positive reinforcement training builds an unbreakable bond and a calm, well-mannered companion. Here are the core strategies:

### 1. Potty Training Mastery (The 1-Hour Rule):
* Take puppies outside **immediately** after waking up, within 15 minutes of eating or drinking, and after vigorous play.
* Stand in one designated spot. When they eliminate, give an immediate enthusiastic reward + high-value treat within 2 seconds.
* Never scold accidents after the fact — clean thoroughly with an **enzymatic cleaner** (like Nature's Miracle) so residual scents don't attract them back.

### 2. Crate Training as a Safe Den:
* The crate should never be used as a punishment. Feed meals inside the crate with the door open initially.
* Place a licked frozen KONG with peanut butter inside to create positive associations with quiet time.
* Crate size rule: Large enough for them to stand, turn around, and lie down comfortably, but not large enough to use one corner as a bathroom.

### 3. Redirecting Puppy Biting & Mouthing:
* Puppies explore with their mouths. When teeth touch skin, give a high-pitched "Ouch!", freeze for 3 seconds, and immediately redirect their teeth onto an appropriate chew toy.

### 4. Managing Separation Anxiety:
* Practice desensitizing departure cues (picking up keys, putting on coat) without leaving.
* Build absence tolerance starting with 30 seconds, 2 minutes, 5 minutes, working up gradually.
* Leave interactive puzzle toys so departure time equals high-value treat time!`,
      suggestedActions: [
        { label: '📋 Create Potty & Routine Checklist', actionType: 'navigate_checklist' },
        { label: '🐾 Ask: Separation Anxiety Protocol', actionType: 'prompt', payload: 'What is a step-by-step plan to resolve separation anxiety in dogs?' },
      ],
    }
  }

  // 6. DEFAULT GENERAL CONSULTATION
  const petSummary = selectedPet
    ? `I'm analyzing your request for **${selectedPet.name}**, your ${selectedPet.breed || selectedPet.species}.`
    : `I'm PawCare's Certified AI Pet Care Consultant.`

  return {
    category: 'general',
    isEmergency: false,
    content: `🐾 **PawCare AI Pet Care Consultant**

${petSummary} How can I assist you with your pet care today?

### Key Areas I Specialize In:
1. **🐕 Dog & Cat Adoption**: Preparation checklists, breed matching, shelter adjustment, puppy/kitten proofing, and initial supplies.
2. **🩺 Symptom Triage**: Evaluating lethargy, appetite changes, stomach upset, ear scratching, and knowing when to see a vet.
3. **🍎 Nutrition & Safety**: Safe vs toxic foods, balanced feeding portions, and smooth diet transitions.
4. **🎾 Training & Behavior**: Potty training, crate training, leash manners, excessive barking, and separation anxiety.
5. **💉 Preventative Healthcare**: Core vaccination schedules, flea/tick prevention, and senior pet mobility support.

*Feel free to describe any situation, symptoms, or questions you have!*`,
    suggestedActions: [
      { label: '🐕 Want to adopt a dog: what to know?', actionType: 'prompt', payload: 'I want to adopt a dog. What do I need to know, prepare, and budget for?' },
      { label: '🩺 Check symptoms: lethargic & not eating', actionType: 'prompt', payload: 'My pet is lethargic and not eating today. What should I check and monitor?' },
      { label: '🍎 Toxic and safe foods list', actionType: 'prompt', payload: 'What human foods are safe for dogs, and which ones are strictly toxic?' },
      { label: '🎾 Potty & crate training 101', actionType: 'prompt', payload: 'What is the best step-by-step method for puppy potty and crate training?' },
    ],
  }
}
