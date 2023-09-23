import * as IconComponents from '@element-plus/icons-vue'

const weaponTypeNames = new Set([
  '光锥', '光錐', 'Lichtkegel', 'Light Cone', 'Conos de luz', 'cônes de lumière', '光円錐', '광추', 'Cones de Luz', 'Световые конусы', 'Nón Ánh Sáng', 'Cône de lumière'
])

const characterTypeNames = new Set([
  '角色', 'Figur', 'Character', 'Personajes', 'Personnages', 'Karakter', 'キャラクター', '캐릭터', 'Personagens', 'Персонажи', 'ตัวละคร', 'Nhân Vật', 'Personnage'
])

const isCharacter = (name) => characterTypeNames.has(name)
const isWeapon = (name) => weaponTypeNames.has(name)

const IconInstaller = (app) => {
  Object.values(IconComponents).forEach(component => {
    app.component(component.name, component)
  })
}

export {
  isWeapon,
  isCharacter,
  IconInstaller,
}
