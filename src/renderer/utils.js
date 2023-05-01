import * as IconComponents from '@element-plus/icons-vue'

const weaponTypeNames = new Set([
  '光锥', 'Light Cone', '光錐', 'Lichtkegel', 'Conos de luz', 'cônes de lumière', '光円錐', '광추', 'Cones de Luz', 'Световые конусы', 'Nón Ánh Sáng'
])

const characterTypeNames = new Set([
  '角色', 'Character', '캐릭터', 'キャラクター', 'Personaje', 'Personnage', 'Персонажи', 'ตัวละคร', 'Nhân Vật', 'Figur', 'Karakter', 'Personagem'
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