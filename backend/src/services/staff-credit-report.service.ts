import {db} from '../config/db.js';
import type {Prisma} from '../generated/prisma/client.js';
import type {Actor} from '../types/express.js';
import {can,permissionScope} from './permissions.js';
import {visibility} from './conversations.service.js';
import {AppError} from '../utils/errors.js';

export function creditReportPeriod(days:number,to=new Date()) {
  const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(to);
  const from=new Date(localDate+'T00:00:00+03:00');
  from.setUTCDate(from.getUTCDate()-(days-1));
  return {from,to};
}

export async function staffCreditReport(actor:Actor,q:{page:number;limit:number;days?:number;agentId?:string;departmentId?:string;search?:string;creditType?:string}) {
  if(actor.role==='CUSTOMER'||!can(actor,'reports.view')) throw new AppError(403,'FORBIDDEN','Kredi raporlarına erişim yetkiniz yok.');
  const {from,to}=creditReportPeriod(q.days??30);
  const search=q.search?.trim();
  const matchedActors=search?await db.user.findMany({where:{name:{contains:search}},select:{id:true}}):[];
  const ticketNumber=search?.replace(/^#?TK-?/i,'');
  const where:Prisma.CreditChargeWhereInput={AND:[
    {createdAt:{gte:from,lte:to}},
    ...(q.creditType==='paid'?[{credits:{gt:0}}]:q.creditType==='free'?[{credits:0}]:[]),
    ...(search?[{OR:[
      {actorId:{in:matchedActors.map(person=>person.id)}},
      {conversation:{is:{OR:[{subject:{contains:search}},{customer:{is:{name:{contains:search}}}},...(/^\d+$/.test(ticketNumber??'')&&Number.isSafeInteger(Number(ticketNumber))?[{number:Number(ticketNumber)}]:[])]}}},
      {agreement:{is:{name:{contains:search}}}},
    ]}]:[]),
    {conversation:{is:{AND:[visibility(actor),...(q.departmentId?[{departmentId:q.departmentId}]:[])]}}},
    ...(q.agentId?[{actorId:q.agentId}]:[]),
    ...(permissionScope(actor)==='OWN'?[{actorId:actor.id}]:[]),
  ]};
  return db.$transaction(async tx=>{
    const total=await tx.creditCharge.count({where});
    const totals=await tx.creditCharge.aggregate({where,_sum:{credits:true}});
    const rows=await tx.creditCharge.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(q.page-1)*q.limit,take:q.limit,
      select:{id:true,actorId:true,credits:true,createdAt:true,agreement:{select:{id:true,name:true}},conversation:{select:{id:true,number:true,subject:true,customer:{select:{id:true,name:true}},department:{select:{id:true,name:true}}}}},
    });
    const groups=await tx.creditCharge.groupBy({by:['actorId'],where:{AND:[where,{actorId:{in:[...new Set(rows.map(row=>row.actorId))]}}]},_sum:{credits:true},_count:{_all:true}});
    const actors=await tx.user.findMany({where:{id:{in:groups.map(group=>group.actorId)}},select:{id:true,name:true}});
    const names=new Map(actors.map(person=>[person.id,person.name]));
    return {
      period:{from,to},totalCredits:totals._sum.credits??0,
      staff:groups.map(group=>({id:group.actorId,name:names.get(group.actorId)??'Silinmiş personel',credits:group._sum.credits??0,count:group._count._all})).sort((a,b)=>b.credits-a.credits||a.name.localeCompare(b.name,'tr')),
      data:rows.map(({actorId,...row})=>({...row,actor:{id:actorId,name:names.get(actorId)??'Silinmiş personel'}})),
      pagination:{page:q.page,limit:q.limit,total,totalPages:Math.max(1,Math.ceil(total/q.limit))},
    };
  });
}
