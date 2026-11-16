import {test,expect,type Page} from '@playwright/test';
const companyId='11111111-1111-4111-8111-111111111111',childId='22222222-2222-4222-8222-222222222222';
async function setup(page:Page,role='ADMIN',permissions?:string[]){
 const company={id:companyId,name:role==='CUSTOMER'?'Şirket Yetkilisi':'Merkez Şirket',company:'Merkez Şirket',role:'CUSTOMER',isActive:true,parentCustomerId:null};
 const children:any[]=Array.from({length:12},(_,i)=>({id:i===0?childId:'contact-'+i,name:'Kişi '+String(i+1).padStart(2,'0'),role:'CUSTOMER',email:i===0?'baran@xn--gzelteknoloji-wob.com':'person'+i+'@example.test',phone:'5301234567',isActive:true,parentCustomerId:companyId}));
 const pack={id:'package',name:'Şirket Paketi',customerId:companyId,customer:company,type:'ONE_OFF',startsOn:'2020-01-01',endsOn:'2099-01-01',credits:100,usedCredits:20,remainingCredits:80,usable:true,state:'ACTIVE'};
 const legacy={...pack,id:'legacy',name:'Eski Kişisel Paket',customerId:childId,customer:children[0],usable:false};
 const requests:string[]=[],writes:any[]=[];
 await page.addInitScript(()=>localStorage.setItem('helpdesk-theme','dark'));
 await page.route('**/socket.io/**',route=>route.abort());
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1',''),method=route.request().method(); requests.push(path);
  const send=(data:unknown)=>route.fulfill({json:{success:true,data,pagination:{page:1,total:1,totalPages:1,limit:15}}});
  if(path==='/auth/refresh')return send({accessToken:'test',user:role==='CUSTOMER'?children[0]:{id:'staff',name:'Yönetici',role, ...(permissions?{rolePermissions:permissions}:{})}});
  if(path==='/auth/security')return send({enabled:false});
  if(path==='/customers'){expect(url.searchParams.get('rootsOnly')).toBe('true');return send([company]);}
  if(path==='/customers/'+companyId+'/relations'){
   if(method==='POST'){const input=route.request().postDataJSON();writes.push(input);children.push({...input.customer,id:'created',isActive:true,parentCustomerId:companyId});return send(children.at(-1));}
   return send({customer:company,parent:null,children});
  }
  if(path==='/customers/'+companyId+'/agreements'||path==='/customers/'+childId+'/agreements')return send({companyName:company.company,customer:path.includes(childId)?children[0]:company,parent:path.includes(childId)?company:null,children:path.includes(childId)?[]:children,agreements:[pack],legacyAgreements:role==='CUSTOMER'?[]:[legacy],charges:[],personalCredits:path.includes(childId)?0:80,parentCredits:80,sharedCredits:80,availableCredits:80});
  if(path==='/customers/'+childId && method==='PATCH'){const req=route.request();const input=req.headers()['content-type']?.includes('multipart/form-data')?Object.fromEntries((await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()!}).formData()).entries()):req.postDataJSON();writes.push({path,...input});Object.assign(children[0],input);return send(children[0]);}
  if(path==='/customers/'+childId+'/files')return send([{id:'file',originalName:'Eski Dosya.pdf',size:1024}]);
  if(path==='/staff-presence')return send({staff:[]});
  return send([]);
 });
 return {requests,writes};
}
test('one management dialog contains company people, create/edit and preserved legacy agreements',async({page})=>{
 const {requests,writes}=await setup(page);await page.goto('/admin/customers');
 await expect(page.getByRole('button',{name:'Merkez Şirket bağlı müşterileri',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.agreement-header-credit')).toContainText('80');
 await expect(dialog.getByRole('switch')).toHaveCount(0);
 await expect(dialog.locator('.company-legacy-agreements')).toHaveCount(0);
 await expect(dialog.getByText('Eski Kişisel Paket',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true}).click();
 const rows=dialog.getByRole('table',{name:'Şirkete Bağlı Kişiler',exact:true}).locator('tbody tr');
 await expect(rows).toHaveCount(10);await expect(rows.first().locator('td').first()).toHaveText('1');
 await expect(rows.first()).toContainText('baran@güzelteknoloji.com');await expect(rows.first()).not.toContainText('xn--');
 await dialog.getByRole('textbox',{name:'Şirket kişilerinde ara',exact:true}).fill('güzelteknoloji');await expect(rows).toHaveCount(1);
 await dialog.getByRole('textbox',{name:'Şirket kişilerinde ara',exact:true}).fill('');
 await dialog.getByRole('button',{name:'Sonraki',exact:true}).click();await expect(rows).toHaveCount(2);await expect(rows.first().locator('td').first()).toHaveText('11');
 await dialog.getByRole('textbox',{name:'Şirket kişilerinde ara',exact:true}).fill('Kişi 01');await expect(rows).toHaveCount(1);
 await rows.getByRole('button',{name:'Kişi 01 kişisini düzenle',exact:true}).click();
 await expect(dialog.locator('.company-person-file-button svg')).toBeVisible();
 const phoneBox=await dialog.getByLabel('Telefon',{exact:true}).locator('..').boundingBox();
 const uploadBox=await dialog.locator('.company-person-file-button').boundingBox();
 expect(Math.abs(phoneBox!.y-uploadBox!.y)).toBeLessThanOrEqual(1);
 expect(Math.abs(phoneBox!.height-uploadBox!.height)).toBeLessThanOrEqual(1);
 await expect(dialog.locator('.company-person-file-button>.field-label')).toHaveText('Dosya Ekle');
 await dialog.screenshot({path:'.local/company-person-file-field.png'});
 await dialog.getByLabel('Kişiye dosya ekle',{exact:true}).setInputFiles({name:'not.txt',mimeType:'text/plain',buffer:Buffer.from('Test notu')});
 await expect(dialog.locator('.company-person-upload')).toContainText('1 dosya seçildi');
 await dialog.getByLabel('Ad Soyad',{exact:true}).fill('Düzenlenen Kişi');await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
 await expect.poll(()=>writes.some(w=>w.name==='Düzenlenen Kişi')).toBe(true);
 await dialog.getByRole('textbox',{name:'Şirket kişilerinde ara',exact:true}).fill('');
 await dialog.getByRole('button',{name:'Kişi Ekle',exact:true}).click();
 await dialog.getByLabel('Ad Soyad',{exact:true}).fill('Yeni Kişi');await dialog.locator('input[name=email]').fill('new@example.test');await dialog.getByLabel('Telefon',{exact:true}).fill('5301234567');
 await expect(dialog.getByLabel('Telefon',{exact:true})).toHaveValue('0530 123 45 67');
 const fields=dialog.locator('.company-person-form>.agreement-field');
 const boxes=await fields.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
 expect(Math.max(...boxes)-Math.min(...boxes)).toBeLessThanOrEqual(1);
 await expect(dialog.locator('.email-field>input')).toHaveCSS('border-top-width','0px');
 await page.screenshot({path:'.local/company-person-form.png',fullPage:true});
 await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
 await expect.poll(()=>writes.some(w=>w.direction==='CHILD'&&w.customer.name==='Yeni Kişi')).toBe(true);
 await expect(page.getByRole('dialog')).toHaveCount(1);
 await page.screenshot({path:'.local/company-management-people.png',fullPage:true});
 await dialog.getByRole('button',{name:'Düzenlenen Kişi dosyaları',exact:true}).click();await expect(dialog.getByText('Eski Dosya.pdf',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);await dialog.getByRole('button',{name:'Kişilere Dön',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/company-management-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(requests.some(p=>p.includes('relation-candidates'))).toBe(false);
});
test('company contact portal has only company balance without personal packages or controls',async({page})=>{
 await setup(page,'CUSTOMER');await page.goto('/customer/agreements');
 await expect(page.getByText('Şirket kredisi',{exact:true})).toBeVisible();await expect(page.locator('.agreement-overview')).toHaveCount(0);
 await expect(page.locator('.customer-agreements-company')).toHaveText('Merkez Şirket');
 await expect(page.locator('.customer-agreements-heading')).not.toContainText('Şirket Yetkilisi');
 await expect(page.locator('.customer-agreements-actions .agreement-header-credit')).toContainText('80');
 const balance=await page.locator('.customer-agreements-actions .agreement-header-credit').boundingBox();const history=await page.getByRole('button',{name:'Kredi Hareketleri',exact:true}).boundingBox();expect(balance!.x+balance!.width).toBeLessThanOrEqual(history!.x);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await expect(page.getByText('Şirket Paketi',{exact:true})).toBeVisible();await expect(page.getByText('Eski Kişisel Paket',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('switch')).toHaveCount(0);await expect(page.getByRole('button',{name:'+ Anlaşma Ekle',exact:true})).toHaveCount(0);
 await page.screenshot({path:'.local/company-contact-credit.png',fullPage:true});
});
test('read-only staff sees company people without mutation controls',async({page})=>{
 await setup(page,'AGENT',['customers.view']);await page.goto('/agent/customers');await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'+ Anlaşma Ekle',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Kişi Ekle',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:/kişisini (sil|düzenle)/})).toHaveCount(0);
});

test('company person form keeps input and identifies email and phone conflicts',async({page})=>{
 await setup(page);
 let field='e-posta';
 await page.route('**/api/v1/customers/'+companyId+'/relations',route=>route.request().method()==='POST'?route.fulfill({status:409,json:{success:false,error:{code:field==='e-posta'?'CUSTOMER_EMAIL_EXISTS':'CUSTOMER_PHONE_EXISTS',message:'Bu '+field+' başka bir müşteri kaydında kullanılıyor.'}}}):route.fallback());
 await page.goto('/admin/customers');await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true}).click();await dialog.getByRole('button',{name:'Kişi Ekle',exact:true}).click();
 await dialog.getByLabel('Ad Soyad',{exact:true}).fill('Yeni Kişi');await dialog.locator('input[name=email]').fill('used@example.test');await dialog.getByLabel('Telefon',{exact:true}).fill('5301234567');
 await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Bu e-posta');
 await expect(dialog.getByLabel('Ad Soyad',{exact:true})).toHaveValue('Yeni Kişi');
 field='telefon';await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Bu telefon');
 await expect(page.getByRole('dialog')).toHaveCount(1);
});

 test('existing people can be searched and linked inside company management',async({page})=>{
  await setup(page);let linked=false;const candidateSearches:string[]=[];
  const existingId='33333333-3333-4333-8333-333333333333';
  await page.route('**/api/v1/customers/'+companyId+'/relation-candidates**',route=>{const url=new URL(route.request().url());candidateSearches.push(url.searchParams.get('search')??'');return route.fulfill({json:{success:true,data:[{id:existingId,name:'Mevcut Kişi',email:'baran@xn--gzelteknoloji-wob.com',company:null}],pagination:{total:1,totalPages:1}}});});
  await page.route('**/api/v1/customers/'+existingId+'/parent',route=>{expect(route.request().method()).toBe('PUT');expect(route.request().postDataJSON()).toEqual({parentCustomerId:companyId});linked=true;return route.fulfill({json:{success:true}});});
  await page.goto('/admin/customers');await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Mevcut Kişi Ekle',exact:true})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Kişi Ekle',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Yeni Kişi',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'Mevcut Kişi',exact:true}).click();
  await expect(dialog.getByLabel('Ad Soyad',{exact:true})).toHaveCount(0);
  await dialog.getByRole('textbox',{name:'Eklenecek kişiyi ara',exact:true}).fill('Mevcut');await expect(dialog.getByRole('button',{name:'Ara',exact:true})).toHaveCount(0);
  await expect.poll(()=>candidateSearches.includes('Mevcut')).toBe(true);
  const candidate=dialog.locator('.company-existing-options>label').first();
  await expect(candidate).toContainText('baran@güzelteknoloji.com');await expect(candidate).not.toContainText('xn--');
  const positions=await candidate.evaluate(node=>{const radio=node.querySelector('input')!.getBoundingClientRect(),name=node.querySelector('strong')!.getBoundingClientRect();return {radioX:radio.x,radioY:radio.y,nameX:name.x,nameBottom:name.bottom};});
  expect(positions.nameX).toBeGreaterThan(positions.radioX);expect(positions.radioY).toBeLessThan(positions.nameBottom+12);
  await dialog.screenshot({path:'.local/company-existing-rows.png'});
  await dialog.getByRole('radio').check();await dialog.getByRole('button',{name:'Seçilen Kişiyi Ekle',exact:true}).click();
  await expect.poll(()=>linked).toBe(true);await expect(dialog.getByRole('heading',{name:'Mevcut Kişiyi Şirkete Ekle',exact:true})).toHaveCount(0);
 });
 test('people tab remains available without a company name',async({page})=>{
  await setup(page);let companyName='';
  await page.route('**/api/v1/customers/'+companyId+'/agreements',route=>route.fulfill({json:{success:true,data:{customer:{id:companyId,name:'Merkez Şirket',company:companyName,parentCustomerId:null},parent:null,children:[],agreements:[],charges:[],availableCredits:0,personalCredits:0}}}));
  await page.goto('/admin/customers');await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Kapat',exact:true}).click();companyName='Yeni Şirket';
  await page.getByRole('button',{name:'Merkez Şirket yönetimi',exact:true}).click();await expect(dialog.getByRole('button',{name:'Şirkete Bağlı Kişiler',exact:true})).toBeVisible();
 });

test('blocked company deletion displays guidance inside the delete dialog',async({page})=>{
 await setup(page);await page.route('**/api/v1/customers/'+companyId,route=>route.request().method()==='DELETE'?route.fulfill({status:409,json:{success:false,error:{code:'COMPANY_HAS_PEOPLE',message:'Bu şirket silinemez çünkü şirkete bağlı kişiler bulunuyor. Önce Yönetim → Şirkete Bağlı Kişiler bölümünden bağlı kişileri silin, ardından şirketi tekrar silmeyi deneyin.'}}}):route.fallback());
 await page.goto('/admin/customers');await page.getByRole('button',{name:'Merkez Şirket sil',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Müşteri Silme Onayı',exact:true});await dialog.getByRole('button',{name:'Müşteriyi Sil',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('bağlı kişileri silin');await expect(dialog).toBeVisible();
});

test('customer agreement heading never substitutes a contact name for a missing company name',async({page})=>{
 await setup(page,'CUSTOMER');
 await page.route('**/api/v1/customers/'+childId+'/agreements',route=>route.fulfill({json:{success:true,data:{customer:{id:childId,name:'Kişi',company:'Eski şirket',parentCustomerId:companyId},parent:{id:companyId,name:'ERCAN GÜZEL',company:null},children:[],agreements:[],charges:[],availableCredits:150}}}));
 await page.goto('/customer/agreements');await expect(page.getByText('Henüz anlaşma bulunmuyor.',{exact:true})).toBeVisible();await expect(page.locator('.customer-agreements-company')).toHaveCount(0);await expect(page.locator('.customer-agreements-heading')).not.toContainText('ERCAN GÜZEL');
});
