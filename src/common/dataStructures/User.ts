export class DiscordUser {
    avatar: string
    id: string
}
export class GoogleUser {
    avatar: string
    id: string
}

export const AvatarSource = {
    Discord: 0x1,
    Google : 0x2
}

export default class User {
    id: string
    discord?: DiscordUser
    google?: GoogleUser
    reputation: number
    roles: number
    wins: number
    lost: number
    username: string
    biography: string
    avatarSource: 0x1 | 0x2
    locale: string
}