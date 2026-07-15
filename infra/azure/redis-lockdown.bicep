targetScope = 'resourceGroup'

param redisName string
param location string
param tags object

resource redis 'Microsoft.Cache/redisEnterprise@2025-08-01-preview' = {
  name: redisName
  location: location
  tags: tags
  sku: { name: 'Balanced_B0' }
  properties: {
    encryption: {}
    highAvailability: 'Enabled'
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
  }
}
