import keytar from 'keytar'

export const credentialStore = {
  async saveToken(token: string) {
    // service 名称通常是你的应用名
    await keytar.setPassword('XunDa', 'user-token', token)
  },
  async getToken(): Promise<string | null> {
    return await keytar.getPassword('XunDa', 'user-token')
  }
}
