const ContactRepo = require('../dist/api/repository/contact.repository').ContactRepository;
(async ()=> {
  try {
    const owner = process.argv[2] || 'rod@gmail.com';
    const contacts = await ContactRepo.findByOwnerId(owner);
    if (!contacts || contacts.length === 0) {
      console.log('NO_CONTACTS');
      return;
    }
    console.log(JSON.stringify(contacts.map(c=>({id:c.id, contact_name:c.contact_name, stellar_public_key:c.stellar_public_key, public_key:c.public_key, owner_id:c.owner_id})), null, 2));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
