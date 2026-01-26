console.log('🔍 Testas pradedamas...');

try {
  const module1 = await import('./state.js');
  console.log('✅ state.js sėkmingai importuotas');
  
  const module2 = await import('./modules/auth.js');
  console.log('✅ auth.js sėkmingai importuotas');
  
  const module3 = await import('./modules/ui.js');
  console.log('✅ ui.js sėkmingai importuotas');
  
} catch (error) {
  console.error('❌ KLAIDA:', error.message);
  console.error('Klaida faile:', error.stack);
}
