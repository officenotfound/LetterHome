# -*- coding: utf-8 -*-
"""Content for scripts/build-guides-2026-11.py. Facts checked 2026-11-17, sources on each page."""

REL_ABROAD = ("/how-to-send-a-letter-to-canada-from-abroad", "Sending Mail From Abroad", "The basics of mailing into Canada from anywhere")
REL_SCHED = ("/schedule-a-letter-for-later", "Schedule a Letter for Later", "Pick the date it is mailed, up to a year ahead")
REL_PROOF = ("/proof-of-mailing", "Proof You Sent a Letter", "What our dated confirmation emails show")
REL_REGVS = ("/registered-mail-vs-xpresspost", "Registered vs Xpresspost", "When you need a signature and when you do not")
REL_LOVE = ("/love-letters-and-personal-mail", "Love Letters and Personal Mail", "Letters that matter, mailed on time")
REL_BETWEEN = ("/send-letters-between-countries", "Send Letters Between Countries", "Mail from one country to another without a post office trip")
REL_BULK = ("/bulk-mailing", "Bulk Mailing", "Send the same letter to many people")
REL_ADDR = ("/how-to-address-a-letter-to-canada", "How to Address a Letter to Canada", "Format and postal codes")
REL_GUIDES = ("/guides", "All Guides", "Every Letterhome guide in one place")

CA = [
 dict(slug="cancel-gym-membership-by-mail",
  title="Cancel a Gym Membership by Letter: Template | Letterhome",
  meta_desc="How to cancel a gym membership in writing: what to include, when to send it, and a letter you can copy. Keep a dated copy so you can show the request was made.",
  service_name="Letter mailing", breadcrumb="Cancel a Gym Membership by Mail", eyebrow="Cancellation letters",
  h1_main="Cancel a gym membership,", h1_em="in writing.",
  hero_sub="Many gyms and clubs only accept a cancellation on paper. A short, dated letter is the simplest way to show you asked.",
  cta_label="Send a Letter →",
  answer_box="Check your contract for the notice period and the address to send cancellations to, write a short letter with your name, member number and the date you want the membership to end, keep a copy, and watch your next card statement to confirm billing stopped.",
  steps=[
   ("Read your contract first", "Look for the notice period (often 30 days), the address cancellations must go to, and any rule about the method. Some contracts say registered mail or in person only."),
   ("Write the letter", "Include your full name, member number, home address, the club location, today's date, and the date the cancellation should take effect. Ask for a written confirmation."),
   ("Mail it and keep a copy", "Send it in time to meet the notice period. Keep the letter and your dated confirmation email somewhere you can find them if billing continues."),
  ],
  warn=("Check the method:", "if your contract says cancellations must go by registered mail or be handed over in person, follow that. Letterhome does not offer registered mail, so use the post office for it."),
  sections=[
   ("A letter you can copy", [
    "Date<br>Club name and address<br><br>Subject: Cancellation of membership, number [your member number]<br><br>I am writing to cancel my membership, effective [date]. Please stop all further payments from this date and confirm the cancellation in writing to the address above.<br><br>Name, address, phone number, signature",
   ]),
   ("Why paper helps", [
    "A phone call or an email to the front desk can be forgotten. A dated letter, plus the confirmation email we send when it is mailed, gives you a record of when you asked. If a charge appears after your cancellation date, you can point to it when you contact the club or your card company.",
   ]),
   ("If you are away from home", [
    "Moved cities, working abroad, or travelling for months? You do not need to go back to the club. Type the letter online and we print and mail it from Canada.",
   ]),
  ],
  faq=[
   ("How much notice do I need to give?", "It depends on your contract. Thirty days is common, but check yours. Count from the day the club receives the letter, not the day you write it."),
   ("Can I cancel by email instead?", "Only if your contract allows it. If it names a mailing address, a letter is the safer choice."),
   ("Does Letterhome give me proof the club received it?", "No. We do not offer tracking or a signature on delivery. Our dated confirmation emails show when your letter was mailed. For signed proof of delivery, use registered mail at a Canada Post office."),
   ("What if they keep charging me?", "Contact the club with a copy of your letter. If it continues, ask your card company about disputing the charge."),
  ],
  related=[REL_PROOF, REL_REGVS, ("/resignation-letter-by-mail", "Resignation Letter by Mail", "Give notice in writing"), REL_GUIDES],
  cta_h2="Need to send it from somewhere else?", cta_p="Type your letter, pay online, and we print and mail it.", cta_final="Send a Letter →"),

 dict(slug="write-to-a-child-at-summer-camp",
  title="Writing to a Child at Summer Camp: Mail Tips | Letterhome",
  meta_desc="How to write to a child at summer camp: what to put on the envelope, when to send the first letter, and what to say. Works for grandparents and parents far away.",
  service_name="Letter mailing", breadcrumb="Writing to a Child at Summer Camp", eyebrow="Camp mail",
  h1_main="Writing to a child", h1_em="at summer camp.",
  hero_sub="Camp mail is the highlight of the day for many kids. Here is how to make sure yours arrives and gets read.",
  cta_label="Send a Letter →",
  answer_box="Ask the camp for its mail rules, address the envelope with the camper's full name and cabin or unit, send the first letter a week before the session starts, then keep writing short, cheerful letters. If you live abroad, schedule letters so they land across the whole session.",
  steps=[
   ("Get the camp's mail rules", "Check the camp's website or parent handbook. Many camps give an address, ask for the camper's full name and session, and ban food, gum or anything with glitter."),
   ("Send the first one early", "Mail time varies. Send a first letter about a week before camp starts, so something is waiting when your child arrives."),
   ("Keep it short and warm", "Kids away from home like news from the family, a joke, and a question they can answer in one line. Skip anything that might make them homesick."),
  ],
  warn=None,
  sections=[
   ("Writing from another country", [
    "Grandparents and relatives abroad can send letters into Canada without arranging stamps or envelopes. Write the letter online, enter the camp's address, and we print and mail it. Mail from abroad to a camp is the same as any other letter, so check the camp's address format first.",
    "Our <a href=\"/schedule-a-letter-for-later\">schedule for later</a> option lets you pick the date each letter is mailed, up to a year ahead. That way you can order a whole summer of letters at once and have them arrive one at a time.",
   ]),
   ("What to put in a camp letter", [
    "Name one specific thing: the dog did something silly, dinner was tacos, your sister lost a tooth. Add one question, such as &ldquo;Which activity did you pick?&rdquo; End with when you will write again. Short letters get read twice.",
   ]),
   ("Things to avoid", [
    "Do not ask why they have not written. Do not send news of anything upsetting without talking to the camp first. Do not enclose items the camp does not allow, such as candy or stickers with glue.",
   ]),
  ],
  faq=[
   ("How long does mail to camp take?", "It depends on the camp's location and the mail route. Allow a week or more, and longer from another country. Letters are not tracked."),
   ("Can I email the camper instead?", "Some camps offer an email-to-letter service. Ask the camp. A printed letter on paper is often kept in a pillowcase and re-read all week."),
   ("What goes on the envelope?", "Follow the camp's instructions. It is usually the camper's full name, session or cabin, the camp name and the camp's mailing address."),
  ],
  related=[REL_SCHED, ("/what-to-write-in-a-letter-to-a-grandparent", "Writing to a Grandparent", "What to say when you do not know where to start"), REL_ABROAD, REL_LOVE],
  cta_h2="Order a summer of letters at once", cta_p="Pick the send date for each one and we mail them on schedule.", cta_final="Send a Letter →"),

 dict(slug="mail-a-letter-to-a-university-student-in-canada",
  title="Mail a Letter to a Student at a Canadian University | Letterhome",
  meta_desc="How to address a letter to a university student in Canada: residence or campus mailroom, mailbox numbers and what to ask the school. For parents near and far.",
  service_name="Letter mailing", breadcrumb="Mail to a University Student in Canada", eyebrow="Students",
  h1_main="Mail a letter to a student", h1_em="at a Canadian university.",
  hero_sub="Students move often, and campus mail works differently from home mail. Check the address first.",
  cta_label="Send a Letter →",
  answer_box="Ask the student, or the school's mail services, for the exact address. Residence mail often goes to a central mailroom with the student's name and a mailbox or room number, while off-campus students use their home address. Check before you send.",
  steps=[
   ("Ask the student for the full address", "Get the building, room or mailbox number, and the postal code. For residence, the university's mail services page usually shows the format to use."),
   ("Use the format the school wants", "Typical order: the student's full name, student number if asked, residence name and room or mailbox, university name, street address, city, province and postal code."),
   ("Write and send", "Type your letter online, add the address, and we print it, put it in an envelope and mail it from Canada."),
  ],
  warn=None,
  sections=[
   ("On campus or off campus", [
    "First-year students often live in residence where mail is sorted by a central mailroom. Upper-year students rent apartments, so their mail goes to their home address. If you are unsure, ask which one they check.",
   ]),
   ("When parents live abroad", [
    "International students often have family overseas. A parent in another country can write the letter online and have it mailed inside Canada, so it arrives like any other letter from within the country. There are no stamps, trips to a post office or international postage to arrange.",
   ]),
   ("What to say", [
    "A letter from home is a nice change from texts. Tell them what is happening at home, ask a specific question, and mention an event you are looking forward to. If it is exam season, keep it short and encouraging.",
   ]),
  ],
  faq=[
   ("Is a student's residence address the same as their home address?", "No. Use the residence or mailroom address the school gives. Ask the student or the university's mail services."),
   ("Will the student be told a letter arrived?", "Some mailrooms post a notice for packages but not letters. Tell your student to expect something."),
   ("Can I send documents too?", "You can include pages with your letter. For official documents such as transcripts, see our guide on mailing student documents."),
  ],
  related=[("/mail-transcripts-and-student-documents", "Mail Transcripts and Student Documents", "Official documents for school"), REL_ADDR, REL_ABROAD, REL_LOVE],
  cta_h2="Write to a student today", cta_p="Type your letter online and we handle the printing and the mailing.", cta_final="Send a Letter →"),

 dict(slug="write-a-letter-to-your-future-self",
  title="Write a Letter to Your Future Self and Have It Mailed | Letterhome",
  meta_desc="How to write a letter to your future self and have it mailed on a date you choose, up to a year ahead. What to write, where to send it, and prompts to start.",
  service_name="Scheduled letter mailing", breadcrumb="Write a Letter to Your Future Self", eyebrow="Letters to yourself",
  h1_main="Write a letter", h1_em="to your future self.",
  hero_sub="Write it today, pick a date, and it arrives in your mailbox when you have forgotten what you wrote.",
  cta_label="Send a Letter →",
  answer_box="Write your letter online, choose the date it should be mailed (up to a year ahead), enter the address where you will be then, and we print and mail it on that day. The scheduling option costs extra and the price is shown before you pay.",
  steps=[
   ("Decide the date", "An anniversary, a birthday, the end of a hard year, the day before a big exam. Pick a date within the next year."),
   ("Write it", "Write about where you are now, what you are afraid of, what you hope for, and what you want to remember. Be specific. Include small details."),
   ("Use an address that will still work", "If you might move, send it to a parent's or friend's address, or to a place you are sure to be."),
  ],
  warn=None,
  sections=[
   ("Prompts to get started", [
    "What are you worried about today? Who are you spending the most time with? What song is stuck in your head? What do you want to have done by the time you read this? What would you tell yourself if you could? Describe an ordinary day so you can compare it later.",
   ]),
   ("How scheduling works", [
    "You can pick any send date within a year. We mail the letter within two business days of that date and Canada Post delivery follows. Schedule a few days earlier if you need it to land on a particular day. See <a href=\"/schedule-a-letter-for-later\">schedule a letter for later</a> for the details.",
   ]),
   ("For birthdays and milestones", [
    "Parents write letters to children to be read years later. The one-year limit means you cannot schedule a letter for a child's 18th birthday today, but you can order one each year, or write one now and mail it when the day comes. We can send it on the date you choose within the year.",
   ]),
  ],
  faq=[
   ("How far ahead can I schedule?", "Up to one year from the day you order."),
   ("What happens if I move?", "The letter goes to the address you entered. Use an address that will work on the date you chose, such as a family member's."),
   ("Can I send it to someone else instead?", "Yes. The same option works for any recipient. A letter timed for a birthday or anniversary is a popular choice."),
   ("Is it private?", "Your letter is printed for mailing and not published. See our privacy policy for how we handle your order."),
  ],
  related=[REL_SCHED, ("/open-when-letters", "Open-When Letters", "Prompts for letters to open at the right moment"), REL_LOVE, REL_GUIDES],
  cta_h2="Mail yourself a letter", cta_p="Pick the date and we mail it.", cta_final="Send a Letter →"),

 dict(slug="open-when-letters",
  title="Open-When Letters: Ideas and What to Write | Letterhome",
  meta_desc="Open-when letters: what they are, 20 ideas for the label on the envelope, and how to write and mail them. A gift for a partner, friend, child or someone far away.",
  service_name="Letter mailing", breadcrumb="Open-When Letters", eyebrow="Letters for later",
  h1_main="Open-when letters:", h1_em="ideas and what to write.",
  hero_sub="Each letter has a label such as &ldquo;Open when you miss me.&rdquo; You write them once and they are there when needed.",
  cta_label="Send a Letter →",
  answer_box="An open-when letter is a letter with a label that says when to open it. Write several, one for each moment, put each in its own envelope with the label on the front, and send them together or one at a time.",
  steps=[
   ("Pick the moments", "Think about when the person will need to hear from you: a bad day, a birthday, a first week away from home."),
   ("Write each one", "Keep each letter to a page. Speak to that moment directly and end with something kind."),
   ("Decide how to send them", "Send them all together, or send one a month so there is always something coming."),
  ],
  warn=None,
  sections=[
   ("Ideas for the label", [
    "Open when you miss me. Open when you cannot sleep. Open when you need a laugh. Open when you have had a bad day. Open when you finish your exams. Open when you are homesick. Open on your birthday. Open when you feel proud. Open when you want to give up. Open when you get your first paycheque. Open on a Sunday. Open when it is raining. Open when you move into your new place. Open the first night in your new city. Open when you are ready to talk.",
   ]),
   ("What to put inside", [
    "Be specific. Name a memory. Say what you admire. Include a photo, a ticket stub or a pressed flower if you like. Avoid advice unless you were asked for it. The point is that the person knows someone is thinking of them.",
   ]),
   ("Mailing several letters", [
    "Our <a href=\"/schedule-a-letter-for-later\">schedule for later</a> option lets you choose the date each one is mailed, up to a year ahead. That means you can write a set tonight and have them land one at a time for the next year.",
   ]),
  ],
  faq=[
   ("How many letters should I write?", "Three to six is a good set. More than that and each one gets thin."),
   ("Who are open-when letters for?", "Partners, friends, children going to university, soldiers, new parents, and anyone who is going through a change."),
   ("Can I send them from another country?", "Yes. Write the letters online and we mail them to any address, inside Canada or abroad."),
  ],
  related=[("/write-a-letter-to-your-future-self", "Letter to Your Future Self", "Write it now, mail it later"), REL_SCHED, REL_LOVE, REL_GUIDES],
  cta_h2="Write the first one tonight", cta_p="Type it online and we print and mail it.", cta_final="Send a Letter →"),

 dict(slug="how-to-write-a-condolence-letter",
  title="How to Write a Condolence Letter | Letterhome",
  meta_desc="How to write a condolence letter: what to say, what to avoid, when to send it and examples of opening lines. For when you cannot be there in person.",
  service_name="Letter mailing", breadcrumb="How to Write a Condolence Letter", eyebrow="Sympathy",
  h1_main="How to write", h1_em="a condolence letter.",
  hero_sub="There is no perfect sentence. A few honest words, mailed, matter more than waiting for the right ones.",
  cta_label="Send a Letter →",
  answer_box="Say you are sorry, name the person who died, share one memory or what they meant to you, offer something specific if you can, and sign it. Keep it short. Send it soon, but a late letter is better than none.",
  steps=[
   ("Start with the plain truth", "&ldquo;I was so sorry to hear that Maria has died.&rdquo; Use their name. Do not worry about being original."),
   ("Share something real", "A memory, a trait, what they meant to you. Specific details help the family feel the person is remembered."),
   ("Offer something specific", "&ldquo;I will call on Sunday&rdquo; is better than &ldquo;let me know if you need anything.&rdquo;"),
  ],
  warn=None,
  sections=[
   ("What to avoid", [
    "Avoid &ldquo;at least&rdquo; sentences, such as &ldquo;at least they are no longer in pain.&rdquo; Do not compare their loss with yours unless you are close. Do not give advice about how to grieve. Do not make the letter about your own feelings.",
   ]),
   ("Opening lines", [
    "&ldquo;I am so sorry for your loss. Your father was one of the kindest people I have known.&rdquo;<br><br>&ldquo;I have been thinking about you since I heard the news.&rdquo;<br><br>&ldquo;I cannot be there, but I wanted you to know I am with you.&rdquo;",
   ]),
   ("When you are far away", [
    "If you cannot attend the funeral, a letter that arrives a few days or weeks later is welcome. Families often receive many messages in the first days and fewer afterwards, so one that arrives later is remembered. Type it online and we print and mail it to the family's address, in Canada or abroad.",
   ]),
   ("A note on handwriting", [
    "Many people prefer to write a condolence note by hand. If you can, do. If you are far away, or your handwriting is hard to read, a printed letter reaches them and still says what you mean.",
   ]),
  ],
  faq=[
   ("How soon should I send a condolence letter?", "Within a few weeks is common, but later is fine. Do not let a delay stop you from writing."),
   ("Is it okay to type a condolence letter?", "Yes. What matters is the message. Sign it by hand if you can, or add your name at the end."),
   ("Should I send flowers instead?", "A letter is not a substitute for what the family needs, but it is something they can keep and re-read."),
   ("What if I did not know the person well?", "Write to the family. Say you are sorry, mention how you knew them, and keep it short."),
  ],
  related=[REL_LOVE, ("/mail-to-retirement-and-nursing-homes", "Mail to Nursing Homes", "Letters to residents"), REL_ABROAD, REL_GUIDES],
  cta_h2="Send your words to the family", cta_p="Type your letter online and we mail it to them.", cta_final="Send a Letter →"),

 dict(slug="write-a-letter-to-your-mp",
  title="How to Write a Letter to Your MP in Canada | Letterhome",
  meta_desc="How to write a letter to your Member of Parliament in Canada: the postage-free address, what to include, and how to be heard. Works from inside Canada and abroad.",
  service_name="Letter mailing", breadcrumb="Write a Letter to Your MP", eyebrow="Civic letters",
  h1_main="How to write a letter", h1_em="to your MP in Canada.",
  hero_sub="A short, specific letter from a constituent gets read. Here is the address and what to put in it.",
  cta_label="Send a Letter →",
  answer_box="Mail to any Member of Parliament can be sent postage-free inside Canada to the House of Commons, Ottawa, Ontario K1A 0A6. Put your own address and postal code on the letter so the office knows you are a constituent, keep to one issue, and say what you want them to do.",
  steps=[
   ("Find your MP", "Look up your riding on the House of Commons website with your postal code. Write to the MP for the place where you live."),
   ("Write one page on one issue", "Say who you are, what the issue is, what it means to you, and what you want your MP to do. Be polite and specific."),
   ("Address it and send it", "Use the House of Commons address, with the MP's name, or the constituency office address on the MP's page."),
  ],
  warn=("Postage-free has limits:", "the House of Commons says mail to MPs is postage-free inside Canada. If you are mailing from another country, normal international postage applies."),
  sections=[
   ("The address", [
    "Name of MP, M.P.<br>House of Commons<br>Ottawa, Ontario<br>K1A 0A6",
    "The House of Commons contact page confirms the postage-free rule. Constituency offices also have their own addresses, which are shown on each MP's page.",
   ]),
   ("What to include", [
    "Your name, home address and postal code at the top, so the office knows you live in the riding. A clear first sentence on the issue. One or two reasons, ideally personal. A specific request: vote for or against, raise it in committee, or meet to discuss it. Thank them for reading it.",
   ]),
   ("If you live abroad", [
    "Canadians abroad are still constituents of the riding where they last lived. Type your letter online, add the House of Commons address, and we print and mail it from inside Canada, so you do not need to arrange Canadian stamps.",
   ]),
  ],
  faq=[
   ("Do I need a stamp?", "Not for mail to an MP at the House of Commons from within Canada, according to the House of Commons. Mail from outside Canada needs normal postage."),
   ("Is a letter better than an email?", "Both are read. A letter on paper stands out and is harder to ignore."),
   ("How long until I hear back?", "It varies by office and by how much mail they are getting. Say in your letter that you would like a reply."),
   ("Can I send the same letter to more than one MP?", "Yes. You can write to your own MP, and to ministers or critics for the issue you care about. See our bulk mailing page for sending several."),
  ],
  related=[("/bulk-mailing", "Bulk Mailing", "Send the same letter to several people"), ("/dispute-credit-report-error", "Dispute a Credit Report Error", "Another letter you may need to write"), REL_ABROAD, REL_GUIDES],
  sources_text="Sources: House of Commons contact page, ourcommons.ca/en/contact-us.",
  cta_h2="Write to your MP", cta_p="Type your letter online and we print and mail it.", cta_final="Send a Letter →"),

 dict(slug="real-estate-letters-by-mail",
  title="Direct Mail Letters for Real Estate Agents | Letterhome",
  meta_desc="How real estate agents can mail a personal letter to a neighbourhood: what to write, how many to send, and how to mail them without printing and stamping each one.",
  service_name="Letter mailing", breadcrumb="Real Estate Letters by Mail", eyebrow="For agents",
  h1_main="Real estate letters", h1_em="by mail.",
  hero_sub="A personal letter gets opened more often than a flyer. Here is how agents use them.",
  cta_label="Send a Letter →",
  answer_box="Pick a small area, write one letter to the owners with something useful in it, mail it in batches, and follow up. Letterhome prints, stamps and mails each letter, so you can send a few at a time without a printer.",
  steps=[
   ("Pick a small area", "Choose a street or a few blocks you know well. A short, local list works better than a large one."),
   ("Write one letter that is useful", "Tell them something real: what a nearby home sold for, what is happening in the market, or an offer to answer questions."),
   ("Mail in batches", "Send a few each week so you can follow up on each batch."),
  ],
  warn=None,
  sections=[
   ("What makes a letter get read", [
    "A name and a first-person voice. One idea per letter. A clear next step, such as a phone number. Plain paper and a normal envelope, so it looks like personal mail. Avoid claims you cannot support and always follow your provincial regulator's rules on advertising.",
   ]),
   ("Where Letterhome fits", [
    "We print each letter, put it in an envelope and mail it. For a handful of letters, the ordinary send page is enough. For larger batches, see our <a href=\"/bulk-mailing\">bulk mailing</a> page.",
   ]),
   ("Keep records", [
    "Our dated confirmation emails record when each letter was mailed, which helps when you track which batch produced a reply.",
   ]),
  ],
  faq=[
   ("Can I put my own return address on the letter?", "Yes. Enter your address as the sender when you order."),
   ("Is this addressed mail?", "Yes. Each letter has its own recipient address, which is different from unaddressed flyers."),
   ("How many can I send at once?", "See the bulk mailing page for batches. For a few letters, use the normal send page."),
  ],
  related=[REL_BULK, ("/business", "Letterhome for Business", "Volume letters and postcards"), REL_PROOF, REL_GUIDES],
  cta_h2="Send your first batch", cta_p="Type the letter once and mail it to each address.", cta_final="Send a Letter →"),
]

# ───────────────────────── US and Spanish pages ─────────────────────────
LOCAL = [
 dict(c='us', slug='debt-validation-letter',
  title='Debt Validation Letter: How to Send One', eyebrow='Debt collectors',
  desc='A debt collector must send a validation notice, and you have 30 days from receiving it to dispute in writing. What to put in the letter and how to mail it.',
  h1='Debt validation letter:<br><em>how to send one</em>',
  sub='If a collector contacts you about a debt, a written request can pause collection while they prove it.',
  answer='A debt collector must send a validation notice within five days of first contacting you. You have 30 days from when you receive it to dispute the debt in writing. If you do it in time, the collector must stop collecting until it sends verification. This is general information, not legal advice.',
  body='''
<h2>What the rule says</h2>
<p>Under the Fair Debt Collection Practices Act, a debt collector must send you a validation notice within five days of its first contact. The notice tells you how much you owe and who the creditor is. You have 30 days from <strong>receiving</strong> the notice to dispute the debt or ask for validation.</p>
<p>The request has to be in writing. No special wording is required. If you send it within the 30 days, the collector must stop collection until it provides verification. If you send it later, the collector does not have to stop while it checks.</p>

<h2>What to put in your letter</h2>
<p>The date. The collector's name and address. Your name and address. The account or reference number from the notice. A plain statement that you dispute the debt and want validation. Ask for the name of the original creditor and proof of the amount. Sign it and keep a copy.</p>
<p>The CFPB publishes a free sample letter you can copy. Search for &ldquo;sample letter for disputing a debt&rdquo; on consumerfinance.gov.</p>

<h2>Mail it in time</h2>
<p>Write down the date the notice arrived, since the 30 days run from then. Mail the letter well before the deadline. We print it, put it in an envelope and mail it. We email you a dated confirmation when it is mailed.</p>
<p>If you want proof that the collector received it, send it by certified mail from the post office. Letterhome does not offer certified mail or tracking.</p>

<h2>What to do next</h2>
<p>Keep a copy of your letter and the notice. If the collector keeps calling or threatens a lawsuit, contact a consumer attorney or legal aid office. Some states have additional protections.</p>
''',
  faq=[('How long do I have to dispute a debt?', 'Thirty days from when you receive the validation notice. Write down the date it arrived.'),
       ('Does a validation letter make the debt go away?', 'No. It makes the collector prove the debt. If they cannot, they must stop. If they can, the debt can still be collected.'),
       ('Should I send it certified?', 'Many people do, to have proof of delivery. Letterhome does not offer certified mail, so use the post office for that.'),
       ('Do I need a lawyer?', 'Not to send a validation request. If you are sued or threatened with a lawsuit, talk to a consumer attorney or legal aid.')],
  sources=[('CFPB: sample letter for disputing a debt', 'https://www.consumerfinance.gov/ask-cfpb/sample-letter-for-disputing-a-debt-en-331/'),
           ('Nolo: debt validation', 'https://www.nolo.com/legal-encyclopedia/debt-validation.html')],
  related=[('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one'), ('/us/what-is-certified-mail', 'What is certified mail?', 'Proof of delivery explained'), ('/respond-to-debt-collection-letter', 'Respond to a debt collection letter', 'The Canadian guide'), ('/dispute-credit-report-error', 'Dispute a credit report error', 'Another letter you may need')]),

 dict(c='us', slug='request-medical-records-by-mail',
  title='Request Your Medical Records by Mail', eyebrow='Your records',
  desc='HIPAA gives you the right to a copy of your medical records, and providers generally have 30 days to respond. What to put in a written request and how to mail it.',
  h1='Request your medical records<br><em>by mail</em>',
  sub='A dated letter starts the clock and gives the provider what it needs.',
  answer='Under HIPAA, a provider generally must provide your records or deny the request in writing within 30 days, and can extend once by up to 30 more days with written notice. Many providers ask for the request in writing. A dated letter gives you a start date for the 30 days.',
  body='''
<h2>Your right to your records</h2>
<p>The HIPAA Privacy Rule gives you the right to see and get a copy of your health records from most doctors, hospitals and health plans. The provider generally has 30 calendar days from receiving your request to provide them or to deny the request in writing. It can extend once, by up to 30 more days, if it tells you in writing before the first 30 days are up.</p>
<p>HHS says 30 days is an outer limit and encourages faster responses. Many practices also have their own request form, so check that first.</p>

<h2>What to put in the letter</h2>
<p>The date. Your full name, date of birth and current address. The provider's name and records department. What you want: all records, or a certain date range or visit. How you want to receive them: paper by mail, or electronic. Where to send them. Your signature.</p>

<h2>Fees</h2>
<p>A provider can charge a reasonable, cost-based fee for copies. Ask what it is before you pay. You do not need to give a reason for the request.</p>

<h2>Mailing it</h2>
<p>Type the letter online, enter the provider's address, and we print it and mail it. We email you a dated confirmation, which shows when it was mailed. If you want signed proof of delivery, send it certified mail from the post office, since we do not offer it.</p>
<p>Records contain private details. Check the pharmacy or practice's preferred address and ask how they send records to you.</p>
''',
  faq=[('How long does a provider have to respond?', 'Generally 30 days from receiving your request, with one extension of up to 30 days if they tell you in writing.'),
       ('Does the request have to be in writing?', 'Many providers ask for it, and a written, dated request is the easiest way to prove when you asked. Check the provider\'s own process.'),
       ('Can I get records sent to someone else?', 'Yes, you can ask for them to be sent to a person you name. Providers may have a form for that.'),
       ('Can they refuse?', 'In limited cases, yes. If they do, they must tell you in writing.')],
  sources=[('HHS: Individuals\' right under HIPAA to access their health information', 'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html'),
           ('45 CFR 164.524, access of individuals to protected health information', 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.524')],
  related=[('/us/debt-validation-letter', 'Debt validation letter', 'Dispute a debt in writing'), ('/proof-of-mailing', 'Proof you sent a letter', 'What our dated emails show'), ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one'), ('/guides', 'All guides', 'Every Letterhome guide')]),

 dict(c='us', slug='donor-thank-you-letters',
  title='Donor Thank-You Letters and the IRS $250 Rule', eyebrow='Nonprofits and churches',
  desc='A donor needs a written acknowledgment for any single gift of $250 or more. What it must say, when to send it, and how to mail thank-you letters without a print room.',
  h1='Donor thank-you letters<br><em>and the IRS $250 rule</em>',
  sub='A good thank-you letter keeps donors giving. For larger gifts, it is also a tax record.',
  answer='For a single gift of $250 or more, a donor generally needs a written acknowledgment from the charity to deduct it. The IRS has no required format. A letter or postcard works if it has the charity\'s name, the amount of cash given and whether any goods or services were provided in return.',
  body='''
<h2>What the IRS asks for</h2>
<p>A donor generally cannot deduct a single gift of $250 or more without a written acknowledgment from the charity. The acknowledgment must be obtained by the earlier of the date the donor files the tax return or the return's due date, including extensions.</p>
<p>There is no required form. A letter, a postcard or a computer-generated receipt is acceptable if it gives enough information. A separate acknowledgment can be sent for each gift, or one annual summary can cover several.</p>

<h2>What the letter must say</h2>
<p>The name of your organization. The amount of any cash given, or a description (not a value) of non-cash gifts. A statement of whether you gave anything in return. If you did, a description of it and a good-faith estimate of its value, because the donor cannot deduct that part.</p>
<p>Gifts under $250 do not need this acknowledgment, but a thank-you letter is still worth sending.</p>

<h2>Mailing a batch</h2>
<p>If you send thank-you letters at the end of the year, you do not need a print room. Write the letter, use our <a href="/bulk-mailing">bulk mailing</a> page for batches, and we print and mail each one. Our dated confirmation emails show when each batch went out.</p>

<h2>Keep it personal</h2>
<p>A donor who receives a letter within a week or two is more likely to give again. Use the donor's name, say what the gift will do, and sign it from a real person.</p>
''',
  faq=[('Is a thank-you letter the same as an IRS acknowledgment?', 'It can be. If the letter has the required details, it works as both.'),
       ('When must the acknowledgment be sent?', 'The donor must have it by the earlier of the filing date or the due date of the return, including extensions. Sending it promptly avoids problems.'),
       ('Does a postcard work?', 'Yes. The IRS says letters, postcards or computer-generated forms are acceptable.'),
       ('What if we gave a dinner or gift in return?', 'Describe it and give a good-faith estimate of its value.')],
  sources=[('IRS Publication 1771: Charitable Contributions, Substantiation and Disclosure Requirements', 'https://www.irs.gov/pub/irs-pdf/p1771.pdf'),
           ('IRS: Charitable contributions, written acknowledgments', 'https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-contributions-written-acknowledgments')],
  related=[('/bulk-mailing', 'Bulk mailing', 'Send the same letter to many people'), ('/business', 'Letterhome for business', 'Volume letters and postcards'), ('/us/how-much-is-a-stamp', 'How much is a stamp?', 'Forever stamp price in 2026'), ('/guides', 'All guides', 'Every Letterhome guide')]),

 dict(c='es', slug='como-enviar-una-carta-a-mexico-desde-ee-uu',
  title='Cómo enviar una carta a México desde EE. UU.', eyebrow='Cartas a México',
  desc='Escriba su carta en línea y nosotros la imprimimos y la enviamos a México. Cómo escribir la dirección, el código postal de 5 dígitos y qué esperar del tiempo de entrega.',
  h1='Cómo enviar una carta<br><em>a México desde EE. UU.</em>',
  sub='Escríbala en línea. Nosotros la imprimimos, le ponemos sobre y franqueo, y la enviamos.',
  answer='Escriba su carta en nuestro sitio, ponga la dirección en México con su código postal de 5 dígitos y pague en línea. Nosotros la imprimimos y la enviamos por correo internacional. No hay rastreo, y el tiempo de entrega varía.',
  body='''
<h2>Cómo escribir una dirección en México</h2>
<p>Use este orden: nombre del destinatario, calle y número, colonia, código postal y ciudad, estado, y al final MÉXICO en mayúsculas.</p>
<p>Nombre<br>Calle y número exterior (y número interior si hay)<br>Colonia<br>Código postal Ciudad, Estado<br>MÉXICO</p>
<p>El código postal en México tiene cinco dígitos. Si no está seguro, pida a su familiar que se lo confirme antes de enviar la carta.</p>

<h2>Antes de pagar</h2>
<p>El precio de la carta a México aparece en la página de envío antes de pagar, con impresión, sobre y franqueo incluidos. Usted escribe la carta en línea o sube un archivo, y nosotros hacemos el resto.</p>

<h2>El tiempo de entrega</h2>
<p>El correo internacional tarda más que el correo dentro de un país, y no podemos prometer una fecha. Las cartas no tienen rastreo. En diciembre y en otras temporadas de mucho correo, envíe la carta con tiempo y avise a su familiar que va en camino. Le mandamos un correo con la fecha en que la enviamos.</p>

<h2>Qué escribir</h2>
<p>Una carta impresa se guarda y se lee varias veces. Ponga los nombres de las personas a quienes va dirigida, cuente noticias de la familia y agregue una foto si lo desea. La impresión a color cuesta un poco más.</p>
''',
  faq=[('¿Puedo enviar una carta a México desde EE. UU.?', 'Sí. Escríbala en nuestro sitio y nosotros la imprimimos y la enviamos a cualquier dirección en México.'),
       ('¿Hay rastreo?', 'No. No ofrecemos rastreo ni firma al recibirla. Le enviamos un correo con la fecha en que la enviamos.'),
       ('¿Cuánto tarda en llegar?', 'Varía. El correo internacional tarda más que el nacional, y no podemos prometer una fecha. Envíela con tiempo.'),
       ('¿Qué pasa si la dirección está incompleta?', 'Pida a su familiar la dirección completa, con colonia y código postal, y un número de teléfono.')],
  sources=[('Correos de México (Servicio Postal Mexicano)', 'https://www.correosdemexico.gob.mx/')],
  related=[('/us/es', 'Letterhome en español', 'Cartas desde EE. UU.'), ('/us/es/como-enviar-una-carta-a-canada-desde-ee-uu', 'Enviar una carta a Canadá', 'Desde EE. UU.'), ('/us/es/como-enviar-una-carta-a-centroamerica-desde-ee-uu', 'Cartas a Centroamérica', 'El Salvador, Guatemala y Honduras'), ('/from-mexico', 'From Mexico to Canada', 'The other direction, in English')]),

 dict(c='es', slug='como-enviar-una-carta-a-centroamerica-desde-ee-uu',
  title='Cómo enviar una carta a Centroamérica desde EE. UU.', eyebrow='Cartas a Centroamérica',
  desc='Cartas a El Salvador, Guatemala y Honduras: cómo escribir la dirección, qué datos agregar y qué esperar del tiempo de entrega. Escriba en línea y nosotros la enviamos.',
  h1='Cómo enviar una carta<br><em>a Centroamérica desde EE. UU.</em>',
  sub='Para El Salvador, Guatemala y Honduras: la dirección correcta hace la diferencia.',
  answer='Escriba su carta en nuestro sitio, ponga la dirección tal como la usa su familiar, con ciudad y país en mayúsculas, y agregue un teléfono de contacto. Nosotros la imprimimos y la enviamos por correo internacional. No hay rastreo, y el tiempo de entrega varía.',
  body='''
<h2>Pida la dirección completa</h2>
<p>En muchos lugares de Centroamérica las direcciones se escriben con colonia o barrio, calle, número de casa y puntos de referencia, y no siempre con el formato que usamos en EE. UU. Lo más seguro es copiar la dirección tal como la usa su familiar, y confirmar con él por teléfono.</p>

<h2>Cómo organizar la dirección</h2>
<p>Nombre del destinatario<br>Colonia, barrio o zona, calle y número de casa<br>Punto de referencia, si lo hay<br>Ciudad y departamento<br>EL SALVADOR, GUATEMALA u HONDURAS</p>
<p>En la Ciudad de Guatemala, por ejemplo, la dirección incluye el número de zona. Si su familiar vive en otra ciudad o en el campo, pídale que le diga cómo recibe el correo allí.</p>

<h2>Agregue un teléfono</h2>
<p>Escriba el número de teléfono del destinatario debajo de la dirección. Ayuda cuando la dirección es difícil de encontrar.</p>

<h2>Tiempo y rastreo</h2>
<p>El correo internacional puede tardar varias semanas. No hay rastreo. En diciembre tarda más. Envíe con tiempo y avise a su familiar que va una carta en camino. Le enviamos un correo con la fecha de envío.</p>

<h2>Precio y pago</h2>
<p>El precio se muestra en la página de envío antes de pagar, con impresión, sobre y franqueo incluidos.</p>
''',
  faq=[('¿Puedo enviar una carta a El Salvador, Guatemala u Honduras desde EE. UU.?', 'Sí. Escríbala en nuestro sitio y nosotros la imprimimos y la enviamos.'),
       ('¿Qué hago si la dirección no tiene número de casa?', 'Escríbala como la usa su familiar, con barrio, calle y punto de referencia, y agregue un teléfono.'),
       ('¿Hay rastreo?', 'No. Le enviamos un correo con la fecha de envío.'),
       ('¿Puedo escribir en español?', 'Sí. Puede escribir su carta en español, y también puede usar nuestro sitio en español.')],
  sources=[('Letterhome: enviar cartas entre países', 'https://letterhome.ca/send-letters-between-countries')],
  related=[('/us/es', 'Letterhome en español', 'Cartas desde EE. UU.'), ('/us/es/como-enviar-una-carta-a-mexico-desde-ee-uu', 'Cartas a México', 'Dirección y código postal'), ('/us/es/como-enviar-una-carta-a-canada-desde-ee-uu', 'Enviar una carta a Canadá', 'Desde EE. UU.'), ('/send-letters-between-countries', 'Send letters between countries', 'In English')]),
]

from guides_2026_11_countries import COUNTRIES
CA = CA[:3] + COUNTRIES + CA[3:]

CA.append(dict(slug="write-a-letter-to-santa",
  title="How to Write a Letter to Santa (and Get a Reply in Canada) | Letterhome",
  meta_desc="How to write a letter to Santa: what to say, the free Canada Post address (H0H 0H0), the December 9 deadline, and a template for kids who cannot write yet.",
  service_name="Letter mailing", breadcrumb="Write a Letter to Santa", eyebrow="Holiday 2026",
  h1_main="How to write", h1_em="a letter to Santa.",
  hero_sub="The address, the deadline, and what to put in the letter so Santa has something to reply to.",
  cta_label="Send a Letter →",
  answer_box="Write the letter, address it to Santa Claus, North Pole, H0H 0H0, Canada, add your own return address, and mail it. Within Canada it needs no stamp. Canada Post says to send it by December 9 this year to get a reply, and December 2 for letters sent by a whole class.",
  steps=[
   ("Write it", "Handwritten or typed, either works. A child who cannot write yet can tell a parent what to say and sign it with a drawing."),
   ("Add the return address", "Santa replies to the address on the letter. A letter without one gets no answer. Put it on the page and on the envelope."),
   ("Mail it by December 9", "Address it to Santa Claus, North Pole, H0H 0H0, Canada. The postal code uses zeros, not the letter O."),
  ],
  warn=("Check the dates every year:", "Canada Post sets the deadline, and it has moved in the past. The December 9 and December 2 dates are the ones it published for 2026. See the Canada Post Santa page for the current rules."),
  sections=[
   ("What a good letter to Santa says", [
    "Santa has a lot of letters to answer. A reply feels personal when the child gave him something to hold on to. Name one real thing from this year, such as learning to ride a bike or losing a first tooth. Ask Santa one question, about the reindeer or the weather at the North Pole. Then say what you would like, and keep that part short. Finish with a thank you and the child's name.",
   ]),
   ("A short letter you can copy", [
    "Dear Santa,<br><br>My name is Maya and I am six. This year I learned to ride my bike without training wheels and I lost two teeth. How cold is it at the North Pole? Do the reindeer get tired? I would like a telescope and a book about space. I will leave you cookies. Thank you for the presents every year.<br><br>Love, Maya<br>12 Maple Street, Ottawa, Ontario, K1A 0B1",
   ]),
   ("The free Canada Post program", [
    "Canada Post runs the Santa program and replies to children who write in. Within Canada, no stamp is needed. Letters from outside Canada need normal postage to Canada, and we could not confirm from the Canada Post page whether overseas letters get a reply, so check its guidelines for international letters before you rely on it.",
    "Source: the Canada Post page, &ldquo;Write a letter to Santa&rdquo;, at canadapost-postescanada.ca/holiday.",
   ]),
   ("When a letter from you will not work out", [
    "A child at a grandparent's house, a family living abroad, or a class with no time to go to a post office can all run into trouble with the deadline. We can print and mail the child's letter from Canada with the family's return address on it. Type what the child said, add the Santa address as the recipient, and enter your own address as the sender. Allow two business days for us to mail it, so order by December 2 to stay ahead of December 9. That is our estimate, and Canada Post decides what counts as received in time. It costs from $6, while doing it yourself within Canada is free, so use us only when that is the easier option.",
   ]),
   ("If you want Santa to write first", [
    "Canada Post's program needs the child to write first. If you would like a letter from Santa to arrive without that, see our <a href=\"/letter-from-santa-canada\">letter from Santa</a> page. Our <a href=\"/free-letter-from-santa-template\">free template</a> works for parents who would rather write the reply themselves.",
   ]),
  ],
  faq=[
   ("What is Santa's address?", "Santa Claus, North Pole, H0H 0H0, Canada. The postal code is H, zero, H, zero, H, zero."),
   ("Do I need a stamp?", "Not for letters mailed within Canada to Santa, according to Canada Post. From another country, normal postage to Canada applies."),
   ("What is the deadline?", "Canada Post's 2026 page says December 9 to get a reply, and December 2 for letters sent by a whole class."),
   ("Will Santa reply if there is no return address?", "No. The reply goes to the return address on the letter."),
   ("Can I type the letter?", "Yes. Typed or handwritten letters are both fine. A child's drawing or signature at the bottom makes it feel like theirs."),
  ],
  related=[("/letter-from-santa-canada", "Letter From Santa in Canada", "Two ways to get a letter from Santa"), ("/free-letter-from-santa-template", "Free Letter From Santa Template", "Write the reply yourself"), ("/santa-letter", "Letter From Santa", "A personalized surprise letter"), ("/canada-post-christmas-mailing-deadlines-2026", "Christmas Mailing Deadlines", "Last days to mail in Canada")],
  cta_h2="Need it mailed from Canada?", cta_p="Type the letter and add your return address. We print and mail it.", cta_final="Send a Letter →"))
