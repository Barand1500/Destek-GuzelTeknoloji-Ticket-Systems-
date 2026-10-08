import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityActionLabel, activityValueLabel, richDescriptionFor } from '../../frontend/src/features/management/activity-log-format.ts';

const base = { id: 'log', createdAt: '2026-10-07' };
test('roles, statuses and channels have readable values', () => {
  assert.equal(activityValueLabel('ADMIN'), 'Yönetici');
  assert.equal(activityValueLabel('OPEN'), 'Açık');
  assert.equal(activityValueLabel('WHATSAPP'), 'WhatsApp');
  assert.equal(activityActionLabel('conversation.channel_reply_failed', { channel: 'SMS' }), 'SMS gönderilemedi');
  assert.equal(activityActionLabel('conversation.channel_reply_failed', { channel: 'WHATSAPP' }), 'WhatsApp mesajı gönderilemedi');
  assert.equal(activityValueLabel(['EMAIL', 'SMS']), 'E-posta, SMS');
});
test('channel send failures explain which provider failed and preserve the provider reason', () => {
  const sms = richDescriptionFor({ ...base, action: 'conversation.channel_reply_failed', metadata: {
    channel: 'SMS', reason: 'Geçersiz SMS başlığı', subject: 'Arıza bildirimi', number: 53,
  } });
  assert.equal(sms, 'SMS gönderimi başarısız oldu. Netgsm yanıtı: Geçersiz SMS başlığı Konu: Arıza bildirimi · Talep no: #TK-00053');

  const whatsapp = richDescriptionFor({ ...base, action: 'conversation.channel_reply_failed', metadata: {
    channel: 'WHATSAPP', reason: 'Geçersiz erişim belirteci',
  } });
  assert.equal(whatsapp, 'WhatsApp gönderimi başarısız oldu. Meta/WhatsApp yanıtı: Geçersiz erişim belirteci');
});
test('technical action codes render in Turkish, including old logs', () => {
  assert.equal(activityActionLabel('profile.updated'), 'Profil bilgileri güncellendi');
  assert.equal(activityActionLabel('survey.created'), 'Anket oluşturuldu');
  assert.equal(activityActionLabel('conversation.whatsapp_received'), 'WhatsApp mesajı alındı');
  assert.equal(richDescriptionFor({ ...base, action: 'profile.updated' }), 'Profil bilgileri güncellendi.');
  assert.equal(activityActionLabel('new.unknown_event'), 'Sistem işlemi');
});
test('survey descriptions show recipient counts and readable channels', () => {
  const text = richDescriptionFor({ ...base, action: 'survey.created', metadata: { recipientCount: 2, channels: ['NOTIFICATION', 'EMAIL'] } });
  assert.equal(text, 'Alıcı sayısı: 2 · Kanallar: Sistem bildirimi, E-posta');
});
test('changed fields are translated and credentials are excluded', () => {
  const text = richDescriptionFor({ ...base, action: 'profile.updated', metadata: {
    fields: ['name', 'phone', 'password'], changes: { isActive: { from: false, to: true }, password: { from: 'secret-one', to: 'secret-two' } },
  } });
  assert.equal(text, 'Güncellenen alanlar: Ad soyad, Telefon · Hesap durumu: Devre dışı → Etkin');
});
