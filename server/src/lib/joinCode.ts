import { customAlphabet } from 'nanoid'

const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ' // omit I,O for clarity
export const generateJoinCode = customAlphabet(alphabet, 8)
