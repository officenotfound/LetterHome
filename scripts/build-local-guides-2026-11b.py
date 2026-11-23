#!/usr/bin/env python3
"""Second batch of US and UK pages (2026-11-22): everyday-mail guides and small free tools for letterhome.us and letterhome.co.uk.
Reuses the page shell from build-local-guides.py. Run from the project root:  python3 scripts/build-local-guides-2026-11b.py
Facts: USPS figures are the ones already checked on public/us-postage-rates-2026.html (Notice 123, Pub 28). UK figures are
the 7 April 2026 stamp prices already on public/uk-how-much-is-a-stamp.html plus Royal Mail and Post Office addressing
guidance. royalmail.com refuses automated fetches, so nothing here quotes a Royal Mail figure we could not confirm elsewhere."""
import importlib.util, math

spec = importlib.util.spec_from_file_location('lg', 'scripts/build-local-guides.py')
lg = importlib.util.module_from_spec(spec); spec.loader.exec_module(lg)
lg.PUBLISHED = '2026-11-22'

_src = open('scripts/build-seo-pages-2026-11.py', encoding='utf-8').read()
_a = _src.index('EXTRA_CSS = """') + len('EXTRA_CSS = """')
CSS = _src[_a:_src.index('"""', _a)]

def tool_shell(inner, script):
    return CSS + inner + '\n<script>\n' + script + '\n</script>\n'

# ───────────────────────── US tool: postage calculator ─────────────────────────
US_CALC = tool_shell('''
<div class="tool">
  <div class="grid">
    <div class="field"><label for="kind">What are you mailing</label><select id="kind">
      <option value="letter">Letter in a regular envelope</option>
      <option value="card">Postcard</option>
      <option value="flat">Large envelope (bigger than 6 1/8 x 11 1/2 in or over 1/4 in thick)</option></select></div>
    <div class="field"><label for="wt">Weight of the sealed envelope</label><input id="wt" type="number" min="0" step="0.1" value="1" inputmode="decimal"></div>
    <div class="field"><label for="unit">Unit</label><select id="unit"><option value="oz">ounces</option><option value="g">grams</option></select></div>
    <div class="field"><label for="how">Postage paid with</label><select id="how"><option value="stamp">Stamps</option><option value="meter">Meter or printed online</option></select></div>
  </div>
  <div class="grid" style="margin-top:14px">
    <div class="field"><label for="svc">Extra service</label><select id="svc">
      <option value="0">None</option>
      <option value="555">Certified Mail (+$5.55)</option>
      <option value="846">Certified Mail with electronic return receipt (+$8.46)</option>
      <option value="1020">Certified Mail with hard copy return receipt (+$10.20)</option></select></div>
  </div>
  <div class="result" id="result" aria-live="polite"></div>
  <h3 style="margin-top:22px">Estimate the weight from the number of sheets</h3>
  <div class="grid">
    <div class="field"><label for="sheets">Sheets of paper</label><input id="sheets" type="number" min="0" step="1" placeholder="e.g. 3" inputmode="numeric"></div>
    <div class="field"><label for="env">Envelope</label><select id="env"><option value="6">Plain #10 envelope, about 6 g</option><option value="4">Light envelope, about 4 g</option><option value="9">Heavy or padded, about 9 g</option></select></div>
  </div>
  <p class="hint" id="estnote">Plain 20 lb printer paper weighs about 4.5 g a sheet. Weigh the real envelope on a kitchen scale if it is close to a whole ounce.</p>
</div>
<p class="caption">Prices from USPS Notice 123 as of the July 12, 2026 change. Domestic mail only. Large envelopes are priced here up to 2 ounces; heavier ones are in the USPS price list.</p>
''', '''
(function(){
  var $=function(i){return document.getElementById(i)};
  var G=28.3495;
  function money(c){return '$'+(c/100).toFixed(2)}
  function calc(){
    var kind=$('kind').value, w=parseFloat($('wt').value), r=$('result');
    if(!(w>0)){r.className='result';r.textContent='Enter the weight of your envelope.';return}
    var oz=$('unit').value==='g'?w/G:w, cents, note='';
    if(kind==='card'){cents=65;note='Postcards go at the postcard rate when they are within the postcard size limits.'}
    else if(kind==='letter'){
      if(oz>3.5){kind='flat'}
      else{var n=Math.ceil(oz-1e-9);cents=82+29*(n-1);if(oz>3){cents=169}
        if($('how').value==='meter')cents-=4;
        note='A letter can weigh up to 3.5 ounces. '+(oz>3?'Between 3 and 3.5 ounces the price is $1.69 stamped.':'')}
    }
    if(kind==='flat'){
      if(oz>2){r.className='result warn';r.innerHTML='<div class="big">Over 2 ounces</div>Large envelopes keep rising by about 30 cents for each extra ounce up to 13 ounces. Look up your exact weight in the <a href="https://pe.usps.com/text/dmm300/Notice123.htm" target="_blank" rel="noopener">USPS price list</a>.';return}
      cents=oz>1?198:169;note='Large envelopes (flats) are priced by the ounce.'
    }
    var svc=parseInt($('svc').value,10);
    if(svc&&kind==='card'){svc=0}
    var total=cents+svc;
    r.className='result ok';
    r.innerHTML='<div class="big">'+money(total)+'</div>'+(svc?'Postage '+money(cents)+' plus the extra service fee '+money(svc)+'.':'Postage for one piece.')+' '+note;
  }
  function est(){
    var s=parseInt($('sheets').value,10);if(!(s>=0)||isNaN(s)){return}
    var g=s*4.5+parseFloat($('env').value), oz=g/G;
    $('estnote').textContent=s+' sheet'+(s===1?'':'s')+' plus the envelope is about '+g.toFixed(1)+' g, or '+oz.toFixed(2)+' ounces. '+(oz<=1?'That is one ounce, so a single Forever stamp covers it.':oz<=3.5?'That rounds up to '+Math.ceil(oz)+' ounces, so you need extra postage.':'That is over 3.5 ounces, so it is priced as a large envelope.');
    $('wt').value=oz.toFixed(2);$('unit').value='oz';calc();
  }
  ['kind','wt','unit','how','svc'].forEach(function(i){$(i).addEventListener('input',calc)});
  ['sheets','env'].forEach(function(i){$(i).addEventListener('input',est)});
  calc();
})();
''')

# ───────────────────────── US tool: address formatter ─────────────────────────
US_FMT = tool_shell('''
<div class="tool">
  <div class="grid">
    <div class="field"><label for="nm">Name</label><input id="nm" placeholder="Maria Lopez" autocomplete="off"></div>
    <div class="field"><label for="st">Street address</label><input id="st" placeholder="1600 Pennsylvania Avenue NW" autocomplete="off"></div>
    <div class="field"><label for="un">Apartment, suite or unit (optional)</label><input id="un" placeholder="Apt 4B" autocomplete="off"></div>
    <div class="field"><label for="ct">City</label><input id="ct" placeholder="Washington" autocomplete="off"></div>
    <div class="field"><label for="sa">State</label><input id="sa" placeholder="DC" maxlength="2" autocomplete="off"></div>
    <div class="field"><label for="zp">ZIP code</label><input id="zp" placeholder="20500 or 20500-0003" inputmode="numeric" autocomplete="off"></div>
  </div>
  <div class="result" id="result" aria-live="polite">Fill in the fields to see the address as the post office reads it.</div>
  <pre class="addr" id="out" hidden></pre>
  <button class="mini-btn" id="copy" type="button" hidden>Copy address</button>
</div>
<p class="caption">This tool checks the shape of the address, not whether the address exists. To confirm a delivery address, use the lookup on usps.com.</p>
''', '''
(function(){
  var $=function(i){return document.getElementById(i)};
  var STATES='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI AA AE AP'.split(' ');
  function clean(s){return s.replace(/[.,#]/g,' ').replace(/\\s+/g,' ').trim().toUpperCase()}
  function run(){
    var nm=clean($('nm').value),st=clean($('st').value),un=clean($('un').value),ct=clean($('ct').value),sa=clean($('sa').value),zp=$('zp').value.trim();
    var r=$('result'),out=$('out'),cp=$('copy'),probs=[];
    if(!(nm||st||ct||sa||zp)){r.className='result';r.textContent='Fill in the fields to see the address as the post office reads it.';out.hidden=true;cp.hidden=true;return}
    if(!st)probs.push('Add a street address.');
    if(!ct)probs.push('Add a city.');
    if(sa&&STATES.indexOf(sa)<0)probs.push('"'+sa+'" is not a two-letter US state or territory abbreviation.');
    if(!sa)probs.push('Add the two-letter state abbreviation.');
    if(zp&&!/^\\d{5}(-\\d{4})?$/.test(zp))probs.push('A ZIP code is 5 digits, or 5 digits, a hyphen and 4 more (ZIP+4).');
    if(!zp)probs.push('Add the ZIP code.');
    var lines=[];if(nm)lines.push(nm);lines.push((st+(un?' '+un:'')).trim());lines.push((ct+' '+sa+' '+zp).replace(/\\s+/g,' ').trim());
    out.textContent=lines.filter(Boolean).join('\\n');out.hidden=false;cp.hidden=false;
    if(probs.length){r.className='result warn';r.innerHTML='<strong>Check this:</strong><br>'+probs.join('<br>')}
    else{r.className='result ok';r.textContent='This is the format the post office reads best: capitals, no punctuation, the unit on the street line, city, state and ZIP on the last line.'}
  }
  ['nm','st','un','ct','sa','zp'].forEach(function(i){$(i).addEventListener('input',run)});
  $('copy').addEventListener('click',function(){
    var t=$('out').textContent,b=$('copy');
    function done(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy address'},1500)}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){})}
  });
})();
''')

# ───────────────────────── UK tool: postage calculator ─────────────────────────
UK_CALC = tool_shell('''
<div class="tool">
  <div class="grid">
    <div class="field"><label for="len">Longest side (mm)</label><input id="len" type="number" min="0" step="1" value="229" inputmode="numeric"></div>
    <div class="field"><label for="wid">Shorter side (mm)</label><input id="wid" type="number" min="0" step="1" value="162" inputmode="numeric"></div>
    <div class="field"><label for="thk">Thickness (mm)</label><input id="thk" type="number" min="0" step="0.5" value="3" inputmode="decimal"></div>
    <div class="field"><label for="wt">Weight of the sealed envelope (g)</label><input id="wt" type="number" min="0" step="1" value="25" inputmode="numeric"></div>
  </div>
  <div class="result" id="result" aria-live="polite"></div>
  <h3 style="margin-top:22px">Estimate the weight from the number of sheets</h3>
  <div class="grid">
    <div class="field"><label for="sheets">Sheets of A4 paper</label><input id="sheets" type="number" min="0" step="1" placeholder="e.g. 3" inputmode="numeric"></div>
    <div class="field"><label for="env">Envelope</label><select id="env"><option value="5">Plain C5 or DL envelope, about 5 g</option><option value="3">Light envelope, about 3 g</option><option value="9">Heavy or padded, about 9 g</option></select></div>
  </div>
  <p class="hint" id="estnote">80gsm A4 paper weighs about 5 g a sheet. Weigh the real letter on kitchen scales if it is close to 100 g.</p>
</div>
<p class="caption">Prices are the 7 April 2026 stamp prices for UK letters and large letters up to 100g. Heavier large letters cost more, so check Royal Mail's price list for those.</p>
''', '''
(function(){
  var $=function(i){return document.getElementById(i)};
  function calc(){
    var L=parseFloat($('len').value),W=parseFloat($('wid').value),T=parseFloat($('thk').value),G=parseFloat($('wt').value),r=$('result');
    if(!(L>0&&W>0&&T>=0&&G>0)){r.className='result';r.textContent='Enter the size and weight of your envelope.';return}
    var a=Math.max(L,W),b=Math.min(L,W);
    if(a<=240&&b<=165&&T<=5&&G<=100){
      r.className='result ok';r.innerHTML='<div class="big">Standard letter</div>First Class <strong>\\u00a31.80</strong> or Second Class <strong>91p</strong>. It fits the letter size (up to 240 x 165 x 5 mm) and is within 100g.';return}
    if(a<=353&&b<=250&&T<=25&&G<=750){
      if(G<=100){r.className='result ok';r.innerHTML='<div class="big">Large letter</div>First Class <strong>\\u00a33.30</strong> or Second Class <strong>\\u00a31.55</strong> up to 100g. It is bigger or thicker than a standard letter, but within the large letter size.';return}
      r.className='result warn';r.innerHTML='<div class="big">Large letter over 100g</div>It is a large letter, but the price rises with each weight step. Look up your weight in the <a href="https://www.royalmail.com/prices2026" target="_blank" rel="noopener">Royal Mail price list</a>.';return}
    r.className='result warn';r.innerHTML='<div class="big">Too big for a letter</div>This is past the large letter limits (353 x 250 x 25 mm and 750g), so it is priced as a small parcel or larger.';
  }
  function est(){
    var s=parseInt($('sheets').value,10);if(isNaN(s)||s<0)return;
    var g=Math.round(s*5+parseFloat($('env').value));
    $('estnote').textContent=s+' sheet'+(s===1?'':'s')+' plus the envelope is about '+g+'g. '+(g<=100?'That is inside the 100g standard letter weight.':'That is over 100g, so it will not go as a standard letter.');
    $('wt').value=g;calc();
  }
  ['len','wid','thk','wt'].forEach(function(i){$(i).addEventListener('input',calc)});
  ['sheets','env'].forEach(function(i){$(i).addEventListener('input',est)});
  calc();
})();
''')

# ───────────────────────── UK tool: address and postcode formatter ─────────────────────────
UK_FMT = tool_shell('''
<div class="tool">
  <div class="grid">
    <div class="field"><label for="nm">Name</label><input id="nm" placeholder="Ms A Patel" autocomplete="off"></div>
    <div class="field"><label for="l1">House number and street</label><input id="l1" placeholder="10 Downing Street" autocomplete="off"></div>
    <div class="field"><label for="l2">Flat, building or village (optional)</label><input id="l2" placeholder="Flat 2" autocomplete="off"></div>
    <div class="field"><label for="tw">Post town</label><input id="tw" placeholder="London" autocomplete="off"></div>
    <div class="field"><label for="pc">Postcode</label><input id="pc" placeholder="SW1A 2AA" autocomplete="off"></div>
  </div>
  <div class="result" id="result" aria-live="polite">Fill in the fields to see the address laid out the way Royal Mail asks for it.</div>
  <pre class="addr" id="out" hidden></pre>
  <button class="mini-btn" id="copy" type="button" hidden>Copy address</button>
</div>
<p class="caption">This checks that the postcode has a valid shape, not that it exists. To find a postcode, use the lookup on the Royal Mail website.</p>
''', '''
(function(){
  var $=function(i){return document.getElementById(i)};
  function clean(s){return s.replace(/[.,]/g,' ').replace(/\\s+/g,' ').trim()}
  var RE=/^(GIR ?0AA|[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[ABD-HJLNP-UW-Z]{2})$/;
  function run(){
    var nm=clean($('nm').value),l1=clean($('l1').value),l2=clean($('l2').value),tw=clean($('tw').value).toUpperCase(),pcr=clean($('pc').value).toUpperCase();
    var r=$('result'),out=$('out'),cp=$('copy'),probs=[],pc=pcr;
    if(!(nm||l1||l2||tw||pcr)){r.className='result';r.textContent='Fill in the fields to see the address laid out the way Royal Mail asks for it.';out.hidden=true;cp.hidden=true;return}
    if(!l1)probs.push('Add the house number and street.');
    if(!tw)probs.push('Add the post town.');
    if(!pcr)probs.push('Add the postcode.');
    else if(!(/^[A-Z0-9 ]+$/.test(pcr)&&RE.test(pcr))){probs.push('That postcode does not have a valid UK shape. A postcode is an outward part and a three-character inward part, like SW1A 2AA.')}
    else{var c=pcr.replace(/\\s+/g,'');pc=c.slice(0,-3)+' '+c.slice(-3)}
    var lines=[nm,l1,l2,tw,pc].filter(Boolean);
    out.textContent=lines.join('\\n');out.hidden=false;cp.hidden=false;
    if(probs.length){r.className='result warn';r.innerHTML='<strong>Check this:</strong><br>'+probs.join('<br>')}
    else{r.className='result ok';r.textContent='Post town and postcode in capitals, the postcode on its own last line with one space inside it, and no commas or full stops.'}
  }
  ['nm','l1','l2','tw','pc'].forEach(function(i){$(i).addEventListener('input',run)});
  $('copy').addEventListener('click',function(){
    var t=$('out').textContent,b=$('copy');
    function done(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy address'},1500)}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){})}
  });
})();
''')

US_SRC_PUB28 = ('USPS Publication 28: Postal Addressing Standards', 'https://pe.usps.com/text/pub28/welcome.htm')
US_SRC_N123 = ('USPS Notice 123: current price list', 'https://pe.usps.com/text/dmm300/Notice123.htm')
US_SRC_2026 = ('USPS: 2026 postage price change', 'https://faq.usps.com/s/article/2026-Postage-Price-Change')
UK_SRC_PO = ('Post Office: how to address mail', 'https://www.postoffice.co.uk/mail/how-to-address-mail')
UK_SRC_RM = ('Royal Mail: prices 2026', 'https://www.royalmail.com/prices2026')
UK_SRC_MSE = ('MoneySavingExpert: Royal Mail stamp price rise, April 2026', 'https://blog.moneysavingexpert.com/news/2026/03/royal-mail-stamp-price-rise-april')

US_REL_STAMP = ('/us/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'The Forever stamp price and what it covers')
US_REL_RATES = ('/us/postage-rates-2026', 'USPS postage rates 2026', 'Letters, postcards, large envelopes and extras')
US_REL_RET = ('/us/return-address-on-a-letter', 'Do you need a return address?', 'When USPS needs one and when it does not')
US_REL_TIME = ('/us/how-long-does-mail-take', 'How long does mail take?', 'First-Class delivery times in 2026')
UK_REL_STAMP = ('/uk/how-much-is-a-stamp', 'How much is a stamp in 2026?', 'First and Second Class prices from April 2026')
UK_REL_TIME = ('/uk/how-long-does-post-take', 'How long does post take?', 'First and Second Class delivery times')
UK_REL_RET = ('/uk/return-address-on-a-letter', 'Do you need a return address?', 'What Royal Mail does without one')

def sheets_rows_us():
    rows = ''
    for n in range(1, 13):
        g = n * 4.5 + 6; oz = g / 28.3495
        k = math.ceil(oz - 1e-9)
        if oz > 3.5: price = '$1.69 (large envelope)'
        elif oz > 3: price = '$1.69'
        else: price = '$%.2f' % (0.82 + 0.29 * (k - 1))
        rows += f'<tr><td>{n}</td><td>{g:.1f} g ({oz:.2f} oz)</td><td>{price}</td></tr>'
    return rows

def sheets_rows_uk():
    rows = ''
    for n in [1, 2, 3, 5, 8, 10, 15, 18, 19, 20, 25]:
        g = n * 5 + 5
        rows += f'<tr><td>{n}</td><td>{g} g</td><td>{"Standard letter" if g <= 100 else "Over 100g, priced higher"}</td></tr>'
    return rows

PAGES = [
# ───────────────────────────── US ─────────────────────────────
dict(c='us', slug='how-to-address-an-envelope',
 title='How to Address an Envelope: Where Everything Goes',
 desc='Where the return address, delivery address and stamp go on a US envelope, how to write the address the way USPS machines read it, and how to handle apartments and military mail.',
 eyebrow='Everyday mail', h1='How to address<br><em>an envelope</em>',
 sub='Return address top left, stamp top right, delivery address in the middle. The details that stop a letter coming back.',
 answer='Put your return address in the top left corner, the stamp in the top right and the recipient\'s address in the middle of the envelope. Write the recipient on the first line, the street on the second, and city, state and ZIP code on the last.',
 body='''
<h2>The layout</h2>
<p>Hold the envelope with the short end at the top. Three things go on the front:</p>
<ul>
<li><strong>Return address</strong>, top left corner, written in the same order as the delivery address.</li>
<li><strong>Stamp</strong>, top right corner.</li>
<li><strong>Delivery address</strong>, in the middle, a little below halfway. Leave blank space around it so the sorting machines can find it.</li>
</ul>

<h2>The delivery address, line by line</h2>
<p>Every US address follows the same order, from the person down to the city:</p>
<pre class="addr">MARIA LOPEZ
1600 PENNSYLVANIA AVE NW APT 4B
WASHINGTON DC 20500-0003</pre>
<p>Line one is the name. Line two is the street number, street name and any apartment or suite. The last line is the city, the two-letter state abbreviation and the ZIP code, with a space between each.</p>

<h2>What the post office prefers</h2>
<p>USPS publishes addressing standards for the machines that sort most mail. Their advice for a letter that moves without delay is:</p>
<ul>
<li>Use capital letters.</li>
<li>Leave out punctuation such as commas and periods. The one exception is the hyphen in a ZIP+4 code.</li>
<li>Put the apartment, suite or unit on the same line as the street address. If it will not fit, put it on the line above.</li>
<li>Use the two-letter state abbreviation, such as NY, CA or TX.</li>
<li>Print or write clearly, in dark ink on a light envelope.</li>
</ul>
<p>Handwriting in lower case with commas is still delivered. The standards describe what is fastest, not what is required.</p>

<h2>The ZIP code</h2>
<p>A ZIP code has five digits. A ZIP+4 adds a hyphen and four more digits that narrow the address down to a block or building. You do not need the four extra digits, but they are harmless to include if you know them.</p>

<h2>Apartments, boxes and businesses</h2>
<p>Write an apartment as <em>APT 4B</em> or <em>UNIT 12</em> after the street. A PO Box goes where the street would, as <em>PO BOX 123</em>. For a person at a company, put the person on the first line and the company name on the second, then the street.</p>

<h2>Military and overseas addresses</h2>
<p>Mail to a service member at a military post office uses a military city (APO, FPO or DPO) in place of the city, and AA, AE or AP in place of the state. The street line is the unit and box number the service member gave you.</p>

<h2>Check it with a tool, then send it</h2>
<p>Our <a href="/us/address-formatter">address formatter</a> lays an address out this way and checks the ZIP code and state abbreviation. If you would rather not address and stamp an envelope at all, type the address into our order form and we print the letter, address the envelope and mail it for $3.00 within the US, with postage included.</p>
''',
 faq=[('Where does the return address go on an envelope?', 'In the top left corner of the front, written in the same order as the delivery address.'),
      ('Where does the stamp go?', 'In the top right corner of the front of the envelope.'),
      ('Do I need to write the address in capital letters?', 'No, but USPS recommends capitals and no punctuation because its sorting machines read that format fastest. Handwritten mail in lower case is still delivered.'),
      ('Where do I put the apartment number?', 'On the same line as the street address, after the street, for example 1600 PENNSYLVANIA AVE NW APT 4B. If it will not fit, put it on the line above.')],
 sources=[US_SRC_PUB28],
 related=[('/us/address-formatter', 'US address formatter', 'Lay out an address the way USPS reads it'), US_REL_RET, US_REL_STAMP, US_REL_TIME]),

dict(c='us', slug='mail-a-letter-without-a-printer',
 title='How to Mail a Letter Without a Printer or Stamps',
 desc='No printer, no envelopes, no stamps? Three ways to get a letter into the mail: write it by hand, print it at a library or shop, or type it online and have it printed and mailed for you.',
 eyebrow='Everyday mail', h1='Mail a letter without<br><em>a printer or stamps</em>',
 sub='Three ways to get a letter into the mail when you have none of the supplies.',
 answer='You can write the letter by hand, print it at a library or print shop and buy stamps at the post office, or type it online and have a service print, envelope and mail it. The online route costs $3.00 with us for a letter within the US.',
 body='''
<h2>Option 1: write it by hand</h2>
<p>If the letter is short and personal, a handwritten page is often better than a printed one. You need paper, an envelope and a Forever stamp. Pens, envelopes and stamps are sold at most pharmacies and supermarkets, and a Forever stamp is 82 cents. The catch is that you still have to get to a mailbox, and a long or formal letter is slow to write out.</p>

<h2>Option 2: print it somewhere else</h2>
<p>Type the letter on any device, save it as a PDF and print it at a library, a copy shop or an office supply store. Libraries often charge a few cents a page. Then you need an envelope and a stamp from a pharmacy or the post office, and a trip to a mailbox. This is the cheapest route if you have the time.</p>

<h2>Option 3: send it online</h2>
<p>Type or paste the letter on our site, add the address, and pay. We print it, fold it, put it in an envelope with the address and your return address on it, and mail it. A letter within the US is <strong>$3.00</strong>, with printing, the envelope and postage included. You do not need a printer, a stamp or a trip to the post office, and you can schedule it for a date you choose.</p>
<p>We send letters within two business days of your order. Where our US printing is running, your letter is printed and mailed inside the US. Otherwise it is printed in Canada and mailed from there, which takes longer. The order page tells you which applies before you pay.</p>

<h2>Which one to pick</h2>
<table class="cost"><thead><tr><th>Route</th><th>Cost</th><th>Time and effort</th></tr></thead><tbody>
<tr><td>Handwritten</td><td>About $1 for stamp and envelope</td><td>Writing time, one trip to a mailbox</td></tr>
<tr><td>Printed at a library or shop</td><td>A few cents a page, plus stamp and envelope</td><td>A trip to print, a trip to mail</td></tr>
<tr><td>Online with us</td><td>$3.00 within the US</td><td>A few minutes at your screen</td></tr>
</tbody></table>
<p>Choose the online route when the letter is long, formal or time-sensitive, when you are far from a post office, or when you want it dated and sent on a particular day. If your letter needs a delivery receipt, such as a notice to a landlord or a debt letter, use Certified Mail at the post office counter instead. Our guide to <a href="/us/what-is-certified-mail">Certified Mail</a> explains what it proves.</p>
''',
 faq=[('Can I mail a letter without a printer?', 'Yes. Write it by hand, print it at a library or print shop, or type it online and have a service print and mail it for you.'),
      ('How much does it cost to mail a letter online in the US?', 'With Letterhome a letter within the US is $3.00, which includes printing, the envelope and postage.'),
      ('Do I need to buy stamps?', 'Not if you send it online. Postage is included. If you mail it yourself, one Forever stamp (82 cents) covers a standard letter up to one ounce.'),
      ('Can I schedule a letter for a future date?', 'Yes. Scheduling is free when you order. We send the letter on the day you pick.')],
 sources=[US_SRC_2026, US_SRC_N123],
 related=[US_REL_STAMP, ('/us/how-many-stamps-does-a-letter-need', 'How many stamps does a letter need?', 'Weight, ounces and what each costs'), ('/send-a-letter-online-in-the-usa', 'Send a letter online in the USA', 'Our US guide and price'), US_REL_TIME]),

dict(c='us', slug='how-many-stamps-does-a-letter-need',
 title='How Many Stamps Does a Letter Need?',
 desc='One Forever stamp covers a letter up to one ounce, about four sheets of paper in an envelope. What to add for each extra ounce, with a table by number of sheets.',
 eyebrow='Everyday mail', h1='How many stamps<br><em>does a letter need?</em>',
 sub='One Forever stamp covers up to one ounce. After that, each extra ounce costs 29 cents more.',
 answer='A standard letter up to one ounce needs one Forever stamp (82 cents). That is about four sheets of printer paper in an envelope. Each extra ounce adds 29 cents, up to 3.5 ounces.',
 body='''
<h2>The short answer</h2>
<p>One Forever stamp pays for a letter up to <strong>1 ounce</strong>, which is roughly <strong>four sheets of plain printer paper</strong> in a regular envelope. Past that, each extra ounce costs <strong>29 cents</strong> more, and a letter can weigh up to 3.5 ounces before it is priced as a large envelope.</p>

<h2>The table by number of sheets</h2>
<p>This table assumes 20 lb printer paper at about 4.5 g a sheet and a plain #10 envelope at about 6 g. Real paper and envelopes vary, so weigh yours if it is close to a whole ounce.</p>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Sheets</th><th>Total weight</th><th>Stamped postage</th></tr></thead><tbody>
''' + sheets_rows_us() + '''
</tbody></table></div>
<p>A sheet counts once whether it is printed on one side or both. Metered or online-printed postage is 4 cents lower than a stamp.</p>

<h2>How to pay the extra</h2>
<p>A Forever stamp always covers the first ounce. For a heavier letter you add postage for each extra ounce, or put a second Forever stamp on it and overpay slightly. The simplest fix is to ask at the post office counter or use the <a href="/us/postage-calculator">postage calculator</a> to see the exact amount.</p>

<h2>When the envelope matters more than the weight</h2>
<p>A letter has to be between 3.5 by 5 inches and 6.125 by 11.5 inches and no more than a quarter inch thick. A stiff, square or lumpy envelope costs extra even when it weighs one ounce. If it is bulky or has a card or keepsake inside, ask at the counter.</p>

<h2>Skip the stamps</h2>
<p>If you would rather not count sheets, type the letter on our site. A letter within the US is $3.00 with postage, envelope and printing included, and extra pages cost a little more. You do not need to weigh anything.</p>
''',
 faq=[('How many stamps do I need for a letter?', 'One Forever stamp for a letter up to 1 ounce, about four sheets of paper in an envelope. Add 29 cents for each extra ounce.'),
      ('How many sheets of paper can I mail with one stamp?', 'About four sheets of 20 lb paper in a plain #10 envelope stay under one ounce. Five sheets go over and need extra postage.'),
      ('How heavy can a regular letter be?', 'Up to 3.5 ounces. Anything heavier is priced as a large envelope.'),
      ('Does printing on both sides change the weight?', 'No. A sheet weighs the same whether it is printed on one side or both.')],
 sources=[US_SRC_N123, US_SRC_2026],
 related=[('/us/postage-calculator', 'US postage calculator', 'Work out the exact price for your letter'), US_REL_RATES, US_REL_STAMP, ('/us/mail-a-letter-without-a-printer', 'Mail a letter without a printer', 'Three ways to get a letter sent')]),

dict(c='us', slug='postage-calculator',
 title='USPS Letter Postage Calculator (2026 Rates)',
 desc='Work out the USPS First-Class price for a letter, postcard or large envelope from its weight, with Certified Mail and return receipt fees. Rates checked November 2026.',
 eyebrow='Free tool', h1='Postage calculator<br><em>for a US letter</em>',
 sub='Enter the weight and see the stamped or metered price, with Certified Mail added if you need it.',
 answer='A stamped First-Class letter up to 1 ounce costs 82 cents and each extra ounce adds 29 cents, up to 3.5 ounces. A postcard costs 65 cents and a large envelope costs $1.69 for the first ounce.',
 body=US_CALC + '''
<h2>The rates</h2>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Weight</th><th>Stamped</th><th>Metered</th></tr></thead><tbody>
<tr><td>1 ounce</td><td>$0.82</td><td>$0.78</td></tr>
<tr><td>2 ounces</td><td>$1.11</td><td>$1.07</td></tr>
<tr><td>3 ounces</td><td>$1.40</td><td>$1.36</td></tr>
<tr><td>3.5 ounces</td><td>$1.69</td><td>$1.65</td></tr>
</tbody></table></div>
<p>Postcards are 65 cents. Large envelopes are $1.69 for the first ounce and $1.98 for two. Certified Mail adds $5.55, an electronic return receipt adds $2.91 and a hard copy receipt adds $4.65.</p>
<p>Our guides cover <a href="/us/postage-rates-2026">every USPS rate in full</a> and <a href="/us/how-many-stamps-does-a-letter-need">how many stamps a letter needs</a>.</p>
''',
 faq=[('How much is postage for a one-ounce letter?', 'A stamped letter up to 1 ounce is 82 cents. With a meter or online postage it is 78 cents.'),
      ('How much does each extra ounce cost?', '29 cents for each additional ounce, up to 3.5 ounces for a letter.'),
      ('How much is Certified Mail?', 'The Certified Mail fee is $5.55 on top of postage. An electronic return receipt adds $2.91 and a hard copy receipt adds $4.65.'),
      ('Is this calculator official?', 'No. It uses published USPS prices from Notice 123 and the July 2026 price change. Check the USPS price list before a large mailing.')],
 sources=[US_SRC_N123, US_SRC_2026],
 related=[('/us/how-many-stamps-does-a-letter-need', 'How many stamps does a letter need?', 'Sheets, ounces and cost'), US_REL_RATES, ('/us/address-formatter', 'US address formatter', 'Lay out an address the USPS way'), US_REL_STAMP]),

dict(c='us', slug='address-formatter',
 title='US Address Formatter: USPS Envelope Format',
 desc='Type an address and see it in the format USPS machines read best: capitals, no punctuation, the unit on the street line. Checks the ZIP code and the state abbreviation. Free.',
 eyebrow='Free tool', h1='US address formatter<br><em>for envelopes</em>',
 sub='Enter the pieces of an address, see it laid out the USPS way, and copy it.',
 answer='USPS prefers capital letters, no punctuation, the apartment or suite on the street line, and city, two-letter state and ZIP code on the last line. This tool lays an address out that way and checks the ZIP code and state.',
 body=US_FMT + '''
<h2>What it checks</h2>
<ul>
<li>The state is a valid two-letter US state, district, territory or military abbreviation.</li>
<li>The ZIP code is five digits, or ZIP+4 with a hyphen.</li>
<li>Commas, periods and number signs are removed and the text is put in capitals, which is the format USPS recommends.</li>
</ul>
<p>It does not look the address up. A street that does not exist will still be formatted. For a full guide to the layout of an envelope, see <a href="/us/how-to-address-an-envelope">how to address an envelope</a>.</p>
''',
 faq=[('What format does USPS prefer for addresses?', 'Capital letters, no punctuation, the apartment or suite on the same line as the street, and city, two-letter state and ZIP code on the last line.'),
      ('What is a ZIP+4?', 'A ZIP code followed by a hyphen and four more digits that narrow the delivery point. It is optional on regular mail.'),
      ('Does this verify the address exists?', 'No. It checks the format only. Use the lookup on usps.com to confirm a delivery address.')],
 sources=[US_SRC_PUB28],
 related=[('/us/how-to-address-an-envelope', 'How to address an envelope', 'Where everything goes'), ('/us/postage-calculator', 'US postage calculator', 'The price for your letter'), US_REL_RET, US_REL_STAMP]),

dict(c='us', slug='business-letter-format',
 title='Business Letter Format: A Layout You Can Copy',
 desc='The standard US business letter layout in order, from your address to the signature, with the spacing and wording that look professional. Plus how to get it printed and mailed.',
 eyebrow='Letter writing', h1='Business letter format<br><em>in order</em>',
 sub='Every part of a formal letter, top to bottom, and what goes in each.',
 answer='A US business letter has your address, the date, the recipient\'s name and address, a greeting, the body in short paragraphs, a closing such as "Sincerely," and your signature, all aligned to the left on one page.',
 body='''
<h2>The parts, top to bottom</h2>
<ol>
<li><strong>Your address.</strong> Your street, city, state and ZIP code, with no name above it if you are using letterhead. Leave a blank line after it.</li>
<li><strong>The date.</strong> Write it out in full, such as <em>November 22, 2026</em>. Leave a blank line.</li>
<li><strong>The recipient.</strong> Name, title if you know it, company, street, city, state and ZIP.</li>
<li><strong>A subject line</strong> if it helps, such as <em>Re: Account 4471</em>, so the reader sees the point at once.</li>
<li><strong>The greeting.</strong> <em>Dear Ms. Alvarez:</em> with a colon. If you do not know the name, <em>Dear Hiring Manager:</em> works. Avoid <em>To whom it may concern</em> when you can find a name.</li>
<li><strong>The body.</strong> Three or four short paragraphs. Say why you are writing in the first sentence, give the details in the middle, and say what you want done at the end.</li>
<li><strong>The closing.</strong> <em>Sincerely,</em> or <em>Best regards,</em> with a comma, then four blank lines.</li>
<li><strong>Your signature and typed name.</strong> Sign in the gap, and type your name below it.</li>
</ol>

<h2>Spacing and font</h2>
<p>Use a plain 11 or 12 point font, single spacing within paragraphs and one blank line between them. Keep one inch of margin on every side. Align everything to the left; it is the simplest block format and the most common one for business mail.</p>

<h2>Keep it to one page</h2>
<p>If the letter runs over, cut it before you shrink the font. A page and a half usually means the same point is made twice. A letter on one sheet is also cheaper to mail, since a few sheets in an envelope stay under one ounce.</p>

<h2>Send it without a printer</h2>
<p>Once your letter is written, paste it into our order form. We print it, put it in an envelope and mail it for $3.00 within the US, with postage included. If it matters that the recipient got it, send it by <a href="/us/what-is-certified-mail">Certified Mail</a> from the post office instead.</p>
''',
 faq=[('What is the standard format of a business letter?', 'Your address, the date, the recipient\'s address, a greeting, the body in short paragraphs, a closing, and your signature and typed name, all aligned to the left.'),
      ('Should I use a colon or a comma after the greeting?', 'A colon in a business letter, such as "Dear Ms. Alvarez:". A comma is for personal letters.'),
      ('How long should a business letter be?', 'One page. Three or four short paragraphs cover most purposes.'),
      ('Do I sign a typed letter?', 'Yes. Leave about four blank lines under the closing, sign in the gap, and type your name beneath it.')],
 sources=[('Purdue OWL: business letter format', 'https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/basic_business_letters/index.html')],
 related=[('/us/how-to-address-an-envelope', 'How to address an envelope', 'Where everything goes'), ('/us/what-is-certified-mail', 'What is Certified Mail?', 'Proof that a letter was mailed'), ('/us/debt-validation-letter', 'Debt validation letter', 'A letter that has to be mailed'), US_REL_STAMP]),

# ───────────────────────────── UK ─────────────────────────────
dict(c='uk', slug='how-to-address-a-letter',
 title='How to Address a Letter in the UK',
 desc='Where the address, return address and stamp go on a UK envelope, how to lay out the lines with the postcode last, and what to leave out. Based on Royal Mail and Post Office guidance.',
 eyebrow='Everyday post', h1='How to address<br><em>a letter</em>',
 sub='Name first, postcode last, nothing underlined. The layout Royal Mail sorts fastest.',
 answer='Write the name on the first line, the house number and street on the second, the post town in capitals on the next line, and the postcode in capitals on its own last line. Put the stamp top right and a return address on the back.',
 body='''
<h2>The layout</h2>
<p>Write the address in the middle or the lower right of the envelope, starting each line at the left. The stamp goes in the top right corner. A return address is optional and goes on the back of the envelope, across the top of the flap, or in the top left of the front.</p>

<h2>The address, line by line</h2>
<pre class="addr">Ms A Patel
10 Downing Street
LONDON
SW1A 2AA</pre>
<p>The first line is the person's name. The next line is the house number or name and the street. If there is a flat or a building, put it on the line above the street or before the number. Then the <strong>post town in capitals</strong>, and the <strong>postcode in capitals on a line of its own</strong>.</p>

<h2>What to leave out</h2>
<ul>
<li><strong>Commas and full stops.</strong> The Post Office advises leaving punctuation out.</li>
<li><strong>The county.</strong> It is not needed if the post town and postcode are there.</li>
<li><strong>Underlining</strong> of the postcode or town.</li>
</ul>

<h2>Writing the postcode</h2>
<p>A UK postcode has two parts separated by one space: an outward code of two to four characters, such as <em>SW1A</em>, and an inward code of one digit and two letters, such as <em>2AA</em>. Write it in capitals with no punctuation. It is the most important line on the envelope, because the sorting machines read it first. Our <a href="/uk/address-formatter">address formatter</a> checks the shape of a postcode and lays out the address for you.</p>

<h2>Letters to someone at a business</h2>
<p>Put the person's name first, then the company, then the street, town and postcode. If you have a department, put it on the line after the company name.</p>

<h2>If you would rather not address an envelope</h2>
<p>Type the address into our order form and we print the letter, address the envelope and post it for £4.50 within the UK, with postage included. Where our UK printing is running, the letter is printed and posted in the UK. Otherwise it is printed in Canada and posted from there, which takes longer. The order page says which before you pay.</p>
''',
 faq=[('Where does the postcode go on a UK address?', 'On its own line, last, in capitals with one space between the two halves and no punctuation.'),
      ('Do I need to write the county?', 'No. The post town and postcode are enough.'),
      ('Should I use commas in an address?', 'No. The Post Office advises leaving out commas and full stops and starting each line at the left.'),
      ('Where does the return address go?', 'On the back of the envelope across the top of the flap, or in the top left of the front. It is optional.')],
 sources=[UK_SRC_PO, ('UK Universal Postal Union: United Kingdom addressing format', 'https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/gbrEn.pdf')],
 related=[('/uk/address-formatter', 'UK address formatter', 'Check a postcode and lay out an address'), UK_REL_RET, UK_REL_STAMP, UK_REL_TIME]),

dict(c='uk', slug='post-a-letter-without-a-printer',
 title='How to Post a Letter Without a Printer or Stamps',
 desc='No printer, envelopes or stamps at home? Three ways to get a letter in the post: write it by hand, print it at a library or shop, or type it online and have it printed and posted for you.',
 eyebrow='Everyday post', h1='Post a letter without<br><em>a printer or stamps</em>',
 sub='Three ways to get a letter into the post when you have none of the supplies.',
 answer='You can write the letter by hand, print it at a library or print shop and buy a stamp, or type it online and have a service print, envelope and post it. The online route costs £4.50 with us for a letter within the UK.',
 body='''
<h2>Option 1: write it by hand</h2>
<p>For a short, personal letter a handwritten page is often better than a printed one. You need paper, an envelope and a stamp. A First Class stamp is £1.80 and a Second Class stamp is 91p, and both are sold at the Post Office, most newsagents and supermarkets. You still have to get to a postbox.</p>

<h2>Option 2: print it somewhere else</h2>
<p>Type the letter, save it as a PDF and print it at a library, a copy shop or an office supply shop. Libraries usually charge a few pence a page. You then need an envelope and a stamp, and a trip to a postbox.</p>

<h2>Option 3: send it online</h2>
<p>Type or paste the letter on our site, add the address and pay. We print it, put it in an envelope with the address and your return address, and post it. A letter within the UK is <strong>£4.50</strong>, with printing, the envelope and postage included. You do not need a printer, a stamp or a trip to a postbox, and you can schedule the letter for a date you choose.</p>
<p>We send letters within two business days of your order. Where our UK printing is running, your letter is printed and posted inside the UK. Otherwise it is printed in Canada and posted from there, which takes longer. The order page tells you which applies, with the price, before you pay.</p>

<h2>Which one to pick</h2>
<table class="cost"><thead><tr><th>Route</th><th>Cost</th><th>Time and effort</th></tr></thead><tbody>
<tr><td>Handwritten</td><td>91p to £1.80 plus an envelope</td><td>Writing time, one trip to a postbox</td></tr>
<tr><td>Printed at a library or shop</td><td>A few pence a page, plus stamp and envelope</td><td>A trip to print, a trip to post</td></tr>
<tr><td>Online with us</td><td>£4.50 within the UK</td><td>A few minutes at your screen</td></tr>
</tbody></table>
<p>The online route suits a long or formal letter, a letter you want dated and sent on a particular day, or one you cannot easily post yourself because you are away from home.</p>
''',
 faq=[('Can I post a letter without a printer?', 'Yes. Write it by hand, print it at a library or print shop, or type it online and have a service print and post it for you.'),
      ('How much does it cost to post a letter online in the UK?', 'With Letterhome a letter within the UK is £4.50, which includes printing, the envelope and postage.'),
      ('How much is a stamp?', 'A First Class stamp is £1.80 and a Second Class stamp is 91p for a standard letter, since 7 April 2026.'),
      ('Can I schedule a letter for a future date?', 'Yes. Scheduling is free when you order, and we send the letter on the day you pick.')],
 sources=[UK_SRC_RM, UK_SRC_MSE],
 related=[UK_REL_STAMP, ('/uk/how-many-sheets-for-a-stamp', 'How many sheets for a stamp?', 'Weight, size and what each costs'), UK_REL_TIME, UK_REL_RET]),

dict(c='uk', slug='how-many-sheets-for-a-stamp',
 title='How Many Sheets of Paper Can You Post With One Stamp?',
 desc='A standard letter can weigh up to 100g, which is about 18 sheets of A4 in an envelope. When a letter becomes a large letter, and what a table of sheets and weights looks like.',
 eyebrow='Everyday post', h1='How many sheets<br><em>for one stamp?</em>',
 sub='A standard letter can weigh up to 100g, so the stamp is rarely the limit. The size is.',
 answer='A standard letter up to 100g costs £1.80 First Class or 91p Second Class. That is about 18 sheets of 80gsm A4 in an envelope. The limit that catches people is thickness: 5mm, after which it is a large letter.',
 body='''
<h2>The short answer</h2>
<p>For a standard letter, one stamp covers anything up to <strong>100g</strong>. A sheet of 80gsm A4 paper weighs about 5g and a plain envelope about 5g, so you can post around <strong>18 sheets</strong> before you reach the weight limit.</p>
<p>The size limits usually come first. A standard letter has to be no more than <strong>240 x 165 mm</strong> and <strong>5mm thick</strong>. Folded A4 in a DL or C5 envelope fits, but a fat stack of paper, a card with a keepsake, or a stiff envelope goes over 5mm well before 100g.</p>

<h2>The table</h2>
<p>This assumes 80gsm A4 paper at about 5g a sheet and a plain envelope at about 5g. Weigh your own if it is close to the limit.</p>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Sheets</th><th>Total weight</th><th>Class of mail</th></tr></thead><tbody>
''' + sheets_rows_uk() + '''
</tbody></table></div>

<h2>When it becomes a large letter</h2>
<p>A letter that is bigger or thicker than a standard letter, up to A4 size and 2.5cm thick, is a large letter. It costs <strong>£3.30</strong> First Class or <strong>£1.55</strong> Second Class up to 100g, and more above that. A padded envelope or a thick bundle of pages falls into this group, even when it is light.</p>

<h2>Check it before you post</h2>
<p>Our <a href="/uk/postage-calculator">postage calculator</a> takes your envelope size and weight and tells you whether it is a standard letter or a large letter, with both prices. If you would rather not count sheets, type the letter on our site: £4.50 within the UK with printing, envelope and postage included.</p>
''',
 faq=[('How many sheets of paper can I post with one stamp?', 'About 18 sheets of 80gsm A4 in a plain envelope stay under the 100g standard letter limit. The 5mm thickness limit may be reached sooner.'),
      ('How heavy can a standard letter be?', 'Up to 100g.'),
      ('How thick can a standard letter be?', 'Up to 5mm. Anything thicker is a large letter, which costs more.'),
      ('How much is a large letter stamp?', 'Up to 100g, £3.30 First Class or £1.55 Second Class. Heavier large letters cost more.')],
 sources=[UK_SRC_RM, UK_SRC_MSE],
 related=[('/uk/postage-calculator', 'UK postage calculator', 'Letter or large letter, with the price'), UK_REL_STAMP, ('/uk/post-a-letter-without-a-printer', 'Post a letter without a printer', 'Three ways to get a letter sent'), UK_REL_TIME]),

dict(c='uk', slug='postage-calculator',
 title='UK Letter Postage Calculator (2026 Stamp Prices)',
 desc='Enter the size and weight of your envelope to see whether it is a standard letter or a large letter, with First and Second Class prices from April 2026.',
 eyebrow='Free tool', h1='Postage calculator<br><em>for a UK letter</em>',
 sub='Enter the size and weight and see whether it is a letter or a large letter, with both prices.',
 answer='A standard letter up to 240 x 165 x 5 mm and 100g costs £1.80 First Class or 91p Second Class. A large letter up to 100g costs £3.30 First Class or £1.55 Second Class.',
 body=UK_CALC + '''
<h2>The prices</h2>
<div class="cost-wrap"><table class="cost"><thead><tr><th>Item</th><th>Limit</th><th>First Class</th><th>Second Class</th></tr></thead><tbody>
<tr><td>Standard letter</td><td>240 x 165 x 5 mm, up to 100g</td><td>£1.80</td><td>91p</td></tr>
<tr><td>Large letter, up to 100g</td><td>353 x 250 x 25 mm, up to 750g</td><td>£3.30</td><td>£1.55</td></tr>
</tbody></table></div>
<p>Prices are the stamp prices since 7 April 2026. Large letters heavier than 100g cost more, in steps by weight. See <a href="/uk/how-many-sheets-for-a-stamp">how many sheets for a stamp</a> for the weight of a typical letter.</p>
''',
 faq=[('How much is a First Class stamp?', 'A First Class stamp for a standard letter is £1.80 since 7 April 2026.'),
      ('How much is a Second Class stamp?', 'A Second Class stamp for a standard letter is 91p since 7 April 2026.'),
      ('What is the largest size for a standard letter?', 'Up to 240 x 165 mm and 5mm thick, and up to 100g. Anything bigger or thicker, up to 353 x 250 x 25 mm and 750g, is a large letter.'),
      ('Is this calculator official?', 'No. It uses published Royal Mail stamp prices. Check the Royal Mail price list for heavier items or other services.')],
 sources=[UK_SRC_RM, UK_SRC_MSE],
 related=[('/uk/how-many-sheets-for-a-stamp', 'How many sheets for a stamp?', 'Weight and size of a typical letter'), ('/uk/address-formatter', 'UK address formatter', 'Lay out an address and check the postcode'), UK_REL_STAMP, UK_REL_TIME]),

dict(c='uk', slug='address-formatter',
 title='UK Address and Postcode Formatter for Envelopes',
 desc='Type an address and see it laid out the way Royal Mail asks for it: post town and postcode in capitals, postcode on its own last line, no punctuation. Checks the postcode shape. Free.',
 eyebrow='Free tool', h1='UK address formatter<br><em>and postcode check</em>',
 sub='Enter the pieces of an address, see it laid out for an envelope, and copy it.',
 answer='Royal Mail asks for the post town and postcode in capitals, the postcode on its own last line with one space inside it, and no commas or full stops. This tool lays an address out that way and checks the postcode has a valid shape.',
 body=UK_FMT + '''
<h2>What it checks</h2>
<ul>
<li>The postcode has a valid UK shape, an outward code and an inward code, and is written in capitals with one space.</li>
<li>Commas and full stops are removed and the post town is put in capitals.</li>
</ul>
<p>It does not look the postcode up. A shape that is valid can still be a postcode nobody uses. For the full layout of an envelope, see <a href="/uk/how-to-address-a-letter">how to address a letter</a>.</p>
''',
 faq=[('What format does Royal Mail want for an address?', 'Name, then house number and street, then the post town in capitals, then the postcode in capitals on its own last line, with no commas or full stops.'),
      ('How is a UK postcode written?', 'An outward code of two to four characters, a space, and an inward code of one digit and two letters, for example SW1A 2AA.'),
      ('Does this confirm the postcode exists?', 'No. It checks the shape only. Use the postcode finder on the Royal Mail website to confirm a postcode.')],
 sources=[UK_SRC_PO],
 related=[('/uk/how-to-address-a-letter', 'How to address a letter', 'Where everything goes'), ('/uk/postage-calculator', 'UK postage calculator', 'The price for your letter'), UK_REL_RET, UK_REL_STAMP]),

dict(c='uk', slug='how-to-write-a-formal-letter',
 title='How to Write a Formal Letter: UK Layout and Endings',
 desc='The UK formal letter layout in order: your address, the date, the recipient, the greeting, the body, and when to end with Yours sincerely or Yours faithfully. Plus how to get it posted.',
 eyebrow='Letter writing', h1='How to write<br><em>a formal letter</em>',
 sub='Every part of a formal letter in the UK style, and the rule for Yours sincerely and Yours faithfully.',
 answer='A UK formal letter has your address at the top right, the date, the recipient\'s name and address on the left, a greeting, a short subject line, the body, and an ending. Use "Yours sincerely" if you began with a name and "Yours faithfully" if you began "Dear Sir or Madam".',
 body='''
<h2>The parts, top to bottom</h2>
<ol>
<li><strong>Your address</strong> at the top right, without your name, with the postcode last. Then the date underneath, written out, such as <em>22 November 2026</em>.</li>
<li><strong>The recipient's name, title and address</strong> on the left, starting a line or two below your date.</li>
<li><strong>The greeting.</strong> <em>Dear Mr Hughes</em> if you know the name, or <em>Dear Sir or Madam</em> if you do not. British style usually leaves out the full stop after Mr, Mrs and Ms, and the comma after the name.</li>
<li><strong>A subject line</strong> in bold or underlined, such as <em>Complaint about order 4471</em>, so the reader sees the point immediately.</li>
<li><strong>The body.</strong> Say why you are writing in the first paragraph, give the details in the middle, and say what you want done and by when in the last.</li>
<li><strong>The ending and your signature.</strong> Sign in the gap, and type your name underneath.</li>
</ol>

<h2>Yours sincerely or Yours faithfully?</h2>
<p>The rule is simple. If you started with a name, such as <em>Dear Mr Hughes</em>, end <strong>Yours sincerely</strong>. If you started <em>Dear Sir or Madam</em>, end <strong>Yours faithfully</strong>. If you do not know the name, try to find it, because a letter to a named person is more likely to be read.</p>

<h2>Keep it to one page</h2>
<p>Use a plain 11 or 12 point font and keep the letter to one side of A4. State dates, reference numbers and amounts exactly. If you are writing to complain, say what you want, such as a refund or a repair, and by when.</p>

<h2>Post it without a printer</h2>
<p>When the letter is ready, paste it into our order form. We print it, put it in an envelope and post it for £4.50 within the UK, with postage included. If you can, keep a copy of what you sent and the date.</p>
''',
 faq=[('How do I start a formal letter in the UK?', 'Write your address at the top right, the date under it, and the recipient\'s name and address on the left. Then the greeting, such as "Dear Mr Hughes".'),
      ('When do I use Yours sincerely and when Yours faithfully?', 'Use Yours sincerely if the letter began with a name and Yours faithfully if it began "Dear Sir or Madam".'),
      ('How long should a formal letter be?', 'One side of A4, with the point stated in the first paragraph.'),
      ('Do I put full stops after Mr and Mrs?', 'British style usually leaves them out, so write "Mr Hughes" and "Mrs Hughes".')],
 sources=[UK_SRC_PO],
 related=[('/uk/how-to-address-a-letter', 'How to address a letter', 'Where everything goes'), ('/uk/post-a-letter-without-a-printer', 'Post a letter without a printer', 'Three ways to get a letter sent'), UK_REL_STAMP, UK_REL_RET]),
]

if __name__ == '__main__':
    for p in PAGES:
        out = f"public/{p['c']}-{p['slug']}.html"
        open(out, 'w', encoding='utf-8').write(lg.build(p))
        print('wrote', out)
    print(','.join(f"'{p['c']}/{p['slug']}'" for p in PAGES))
