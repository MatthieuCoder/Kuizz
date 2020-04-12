export default class Role {
    public readonly bit: number
    public readonly name: string
    public constructor(bit: number, string: string) {
        this.bit = bit
        this.name = string
    }
}

export const ROLES_ENUM = {
    'Administrator': new Role(0x1, 'Administrator'),
    'Moderator': new Role(0x2, 'Moderator'),
    'User': new Role(0x0, 'User')
}

export function getRoles(bitFlags: number): Role[] {
    const roles = []
    Object.keys(ROLES_ENUM)
        .forEach((key) => {
            const roleImplementation: Role = ROLES_ENUM[key]
            if(( bitFlags & roleImplementation.bit ) === roleImplementation.bit) roles.push(roleImplementation)
        })
    delete roles[1]
    return roles
}