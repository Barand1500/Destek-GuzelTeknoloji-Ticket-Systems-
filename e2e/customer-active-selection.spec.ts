import {test,expect} from '@playwright/test';
test('new ticket search excludes inactive people and blocks direct inactive selection',async({page})=>{
 const inactive={id:'inactive',name:'Pasif Kişi',email:'inactive@example.test',isActive:false,role:'CUSTOMER'};
 const active={...inactive,id:'active',name:'Aktif Kişi',isActive:true};let activeFilter='';
 await page.route('**/api/v1/**',route=>{const url=new URL(route.request().url()),path=url.pathname;let data:unknown=[];
 if(path.endsWith('/auth/refresh'))data={accessToken:'test',user:{id:'admin',name:'Admin',role:'ADMIN'}};
 if(path.endsWith('/communication-channels'))data={channels:[],defaultDepartment:null};
 if(path.endsWith('/customers/inactive'))data=inactive;
 if(path.endsWith('/customers')){activeFilter=url.searchParams.get('isActive')||'';return route.fulfill({json:{success:true,data:[active,inactive],pagination:{total:2,totalPages:1,page:1,limit:15}}});}
 return route.fulfill({json:{success:true,data}});
 });
 await page.goto('/admin/phone-support?customerId=inactive');await expect(page.getByRole('alert')).toContainText('Bu müşteri hesabı pasif');
 await page.getByRole('searchbox').fill('Kişi');await expect.poll(()=>activeFilter).toBe('true');
 await expect(page.locator('.customer-choice')).toHaveCount(1);await expect(page.locator('.customer-choice')).toContainText('Aktif Kişi');
});
