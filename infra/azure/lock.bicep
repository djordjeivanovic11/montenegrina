targetScope = 'resourceGroup'

resource deletionLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'montenegrina-production-delete-lock'
  properties: {
    level: 'CanNotDelete'
    notes: 'Protects the independent Montenegrina production resource group from accidental deletion.'
  }
}
