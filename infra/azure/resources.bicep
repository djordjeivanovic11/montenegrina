param environmentName string
param location string
param resourceToken string
param tags object
@secure()
param postgresAdminPassword string
@secure()
param sessionSecret string
@secure()
param internalTokenSecret string
@secure()
param voiceAgentServiceSecret string
@secure()
param livekitUrl string
@secure()
param livekitApiKey string
@secure()
param livekitApiSecret string
@secure()
param openaiApiKey string
@secure()
param deepgramApiKey string
@secure()
param elevenlabsApiKey string
@secure()
param elevenlabsVoiceId string
@secure()
param googleClientId string
@secure()
param resendApiKey string
@secure()
param turnstileSecretKey string
param turnstileSiteKey string

var registryName = take('crmont${replace(environmentName, '-', '')}${resourceToken}', 50)
var storageName = take('stmont${replace(environmentName, '-', '')}${resourceToken}', 24)
var vaultName = take('kv-${environmentName}-${resourceToken}', 24)
var postgresName = take('psql-${environmentName}-${resourceToken}', 63)
var redisName = take('redis-${environmentName}-${resourceToken}', 60)
var environmentResourceName = 'cae-${environmentName}'
var webName = take('ca-web-${environmentName}', 32)
var apiName = take('ca-api-${environmentName}', 32)
var workerName = take('ca-worker-${environmentName}', 32)
var voiceAgentName = take('ca-voice-${environmentName}', 32)
var parserName = take('ca-parser-${environmentName}', 32)
var migrationJobName = 'job-migrate-${environmentName}'
var seedJobName = 'job-seed-${environmentName}'
var postgresUser = 'montenegrinaadmin'
var postgresDatabase = 'montenegrina'
var publicWebUrl = 'https://voice.mne-mcp.com'
var publicApiUrl = 'https://api.voice.mne-mcp.com'
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var blobContributorRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453e-a403-e96b0029c9fe')
var keyVaultSecretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource deletionLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'montenegrina-production-delete-lock'
  properties: {
    level: 'CanNotDelete'
    notes: 'Protects the independent Montenegrina production resource group from accidental deletion.'
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${environmentName}'
  location: location
  tags: tags
  properties: { retentionInDays: 30, sku: { name: 'PerGB2018' } }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${environmentName}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${environmentName}'
  location: location
  tags: tags
  properties: { addressSpace: { addressPrefixes: ['10.42.0.0/16'] } }
}

resource appsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-container-apps'
  properties: {
    addressPrefix: '10.42.0.0/23'
    delegations: [{ name: 'Microsoft.App.environments', properties: { serviceName: 'Microsoft.App/environments' } }]
  }
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-postgres'
  properties: {
    addressPrefix: '10.42.2.0/27'
    delegations: [{ name: 'Microsoft.DBforPostgreSQL.flexibleServers', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
  }
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-private-endpoints'
  properties: { addressPrefix: '10.42.3.0/27', privateEndpointNetworkPolicies: 'Disabled' }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = { name: 'montenegrina.postgres.database.azure.com', location: 'global', tags: tags }
resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: 'vnet-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  tags: tags
  sku: { name: 'Standard_D2ds_v5', tier: 'GeneralPurpose' }
  properties: {
    version: '16'
    administratorLogin: postgresUser
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 128, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Enabled' }
    highAvailability: { mode: 'ZoneRedundant' }
    network: { delegatedSubnetResourceId: postgresSubnet.id, privateDnsZoneArmResourceId: postgresDns.id }
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
  }
  dependsOn: [postgresDnsLink]
}
resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = { parent: postgres, name: postgresDatabase, properties: { charset: 'UTF8', collation: 'en_US.utf8' } }
resource postgresExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = { parent: postgres, name: 'azure.extensions', properties: { value: 'VECTOR,PG_TRGM,UNACCENT', source: 'user-override' } }

resource redis 'Microsoft.Cache/redisEnterprise@2025-08-01-preview' = {
  name: redisName
  location: location
  tags: tags
  sku: { name: 'Balanced_B0' }
  properties: { encryption: {}, highAvailability: 'Enabled', minimumTlsVersion: '1.2', publicNetworkAccess: 'Disabled' }
}
resource redisDb 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  parent: redis
  name: 'default'
  properties: { accessKeysAuthentication: 'Enabled', clientProtocol: 'Encrypted', clusteringPolicy: 'OSSCluster', evictionPolicy: 'NoEviction', modules: [], port: 10000 }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, allowSharedKeyAccess: false, minimumTlsVersion: 'TLS1_2', publicNetworkAccess: 'Disabled', supportsHttpsTrafficOnly: true }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: { deleteRetentionPolicy: { enabled: true, days: 14 }, containerDeleteRetentionPolicy: { enabled: true, days: 14 }, isVersioningEnabled: true }
}
resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = { parent: blobService, name: 'montenegrina', properties: { publicAccess: 'None' } }

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: { adminUserEnabled: false, publicNetworkAccess: 'Enabled', policies: { retentionPolicy: { days: 30, status: 'enabled' } } }
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    enabledForTemplateDeployment: true
    publicNetworkAccess: 'Disabled'
    networkAcls: { bypass: 'AzureServices', defaultAction: 'Deny' }
  }
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = { name: 'id-backend-${environmentName}', location: location, tags: tags }
resource frontendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = { name: 'id-frontend-${environmentName}', location: location, tags: tags }
resource backendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = { name: guid(registry.id, backendIdentity.id, 'pull'), scope: registry, properties: { principalId: backendIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: acrPullRole } }
resource frontendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = { name: guid(registry.id, frontendIdentity.id, 'pull'), scope: registry, properties: { principalId: frontendIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: acrPullRole } }
resource backendBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = { name: guid(storage.id, backendIdentity.id, 'blob'), scope: storage, properties: { principalId: backendIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: blobContributorRole } }
resource backendVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = { name: guid(vault.id, backendIdentity.id, 'secrets'), scope: vault, properties: { principalId: backendIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: keyVaultSecretsUserRole } }

var databaseUrl = 'postgresql://${postgresUser}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDatabase}?sslmode=require'
var redisUrl = 'rediss://default:${uriComponent(redisDb.listKeys().primaryKey)}@${redis.properties.hostName}:10000'
var staticKeyVaultValues = [
  { name: 'session-secret', value: sessionSecret }
  { name: 'internal-token-secret', value: internalTokenSecret }
  { name: 'voice-agent-service-secret', value: voiceAgentServiceSecret }
  { name: 'livekit-url', value: livekitUrl }
  { name: 'livekit-api-key', value: livekitApiKey }
  { name: 'livekit-api-secret', value: livekitApiSecret }
  { name: 'openai-api-key', value: openaiApiKey }
  { name: 'deepgram-api-key', value: deepgramApiKey }
  { name: 'elevenlabs-api-key', value: elevenlabsApiKey }
  { name: 'elevenlabs-voice-id', value: elevenlabsVoiceId }
  { name: 'google-client-id', value: googleClientId }
  { name: 'resend-api-key', value: resendApiKey }
  { name: 'turnstile-secret-key', value: turnstileSecretKey }
]
resource vaultSecrets 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = [for secret in staticKeyVaultValues: {
  parent: vault
  name: secret.name
  properties: { value: secret.value }
}]
resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'database-url'
  properties: { value: databaseUrl }
}
resource redisUrlSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'redis-url'
  properties: { value: redisUrl }
}

resource blobDns 'Microsoft.Network/privateDnsZones@2024-06-01' = { name: 'privatelink.blob.${environment().suffixes.storage}', location: 'global' }
resource vaultDns 'Microsoft.Network/privateDnsZones@2024-06-01' = { name: 'privatelink.vaultcore.azure.net', location: 'global' }
resource redisDns 'Microsoft.Network/privateDnsZones@2024-06-01' = { name: 'privatelink.redisenterprise.cache.azure.net', location: 'global' }
resource blobDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: blobDns
  name: 'vnet-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource vaultDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: vaultDns
  name: 'vnet-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource redisDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: redisDns
  name: 'vnet-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource blobEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = { name: 'pe-${storageName}-blob', location: location, properties: { subnet: { id: privateEndpointSubnet.id }, privateLinkServiceConnections: [{ name: 'blob', properties: { privateLinkServiceId: storage.id, groupIds: ['blob'] } }] } }
resource vaultEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = { name: 'pe-${vaultName}', location: location, properties: { subnet: { id: privateEndpointSubnet.id }, privateLinkServiceConnections: [{ name: 'vault', properties: { privateLinkServiceId: vault.id, groupIds: ['vault'] } }] } }
resource redisEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = { name: 'pe-${redisName}', location: location, properties: { subnet: { id: privateEndpointSubnet.id }, privateLinkServiceConnections: [{ name: 'redis', properties: { privateLinkServiceId: redis.id, groupIds: ['redisEnterprise'] } }] } }
resource blobDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = { parent: blobEndpoint, name: 'default', properties: { privateDnsZoneConfigs: [{ name: 'blob', properties: { privateDnsZoneId: blobDns.id } }] } }
resource vaultDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = { parent: vaultEndpoint, name: 'default', properties: { privateDnsZoneConfigs: [{ name: 'vault', properties: { privateDnsZoneId: vaultDns.id } }] } }
resource redisDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = { parent: redisEndpoint, name: 'default', properties: { privateDnsZoneConfigs: [{ name: 'redis', properties: { privateDnsZoneId: redisDns.id } }] } }

resource containerEnvironment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: environmentResourceName
  location: location
  tags: tags
  properties: {
    zoneRedundant: true
    vnetConfiguration: { infrastructureSubnetId: appsSubnet.id, internal: false }
    appLogsConfiguration: { destination: 'log-analytics', logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey } }
  }
}

var backendIdentityMap = { '${backendIdentity.id}': {} }
var frontendIdentityMap = { '${frontendIdentity.id}': {} }
var registryBackend = [{ server: registry.properties.loginServer, identity: backendIdentity.id }]
var registryFrontend = [{ server: registry.properties.loginServer, identity: frontendIdentity.id }]
var backendSecretNames = ['database-url', 'redis-url', 'session-secret', 'internal-token-secret', 'voice-agent-service-secret', 'livekit-url', 'livekit-api-key', 'livekit-api-secret', 'openai-api-key', 'deepgram-api-key', 'elevenlabs-api-key', 'elevenlabs-voice-id', 'google-client-id', 'resend-api-key', 'turnstile-secret-key']
var backendSecretRefs = [for name in backendSecretNames: { name: name, keyVaultUrl: 'https://${vault.name}${environment().suffixes.keyvaultDns}/secrets/${name}', identity: backendIdentity.id }]
var commonBackendEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'REDIS_URL', secretRef: 'redis-url' }
  { name: 'S3_BUCKET', value: 'montenegrina' }
  { name: 'S3_REGION', value: location }
  { name: 'STORAGE_BACKEND', value: 'azure' }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: 'https://${storage.name}.blob.${environment().suffixes.storage}' }
  { name: 'AZURE_STORAGE_CONTAINER', value: blobContainer.name }
  { name: 'SESSION_SECRET', secretRef: 'session-secret' }
  { name: 'INTERNAL_TOKEN_SECRET', secretRef: 'internal-token-secret' }
  { name: 'LIVEKIT_URL', secretRef: 'livekit-url' }
  { name: 'PUBLIC_LIVEKIT_URL', secretRef: 'livekit-url' }
  { name: 'LIVEKIT_API_KEY', secretRef: 'livekit-api-key' }
  { name: 'LIVEKIT_API_SECRET', secretRef: 'livekit-api-secret' }
  { name: 'VOICE_AGENT_SERVICE_SECRET', secretRef: 'voice-agent-service-secret' }
  { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
  { name: 'DEEPGRAM_API_KEY', secretRef: 'deepgram-api-key' }
  { name: 'ELEVENLABS_API_KEY', secretRef: 'elevenlabs-api-key' }
  { name: 'ELEVENLABS_MONTENEGRIN_VOICE_ID', secretRef: 'elevenlabs-voice-id' }
  { name: 'GOOGLE_CLIENT_ID', secretRef: 'google-client-id' }
  { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
  { name: 'TURNSTILE_SECRET_KEY', secretRef: 'turnstile-secret-key' }
  { name: 'PUBLIC_WEB_URL', value: publicWebUrl }
  { name: 'PUBLIC_API_URL', value: publicApiUrl }
  { name: 'CORS_ORIGINS', value: publicWebUrl }
  { name: 'COOKIE_SECURE', value: 'true' }
  { name: 'EMAIL_PROVIDER', value: 'resend' }
  { name: 'EMAIL_FROM', value: 'Montenegrina <noreply@voice.mne-mcp.com>' }
  { name: 'EMAIL_VERIFICATION_REQUIRED', value: 'true' }
  { name: 'REGISTRATION_ENABLED', value: 'true' }
  { name: 'BILLING_ENABLED', value: 'false' }
  { name: 'PHONE_INTEGRATIONS_ENABLED', value: 'false' }
  { name: 'RECORDINGS_ENABLED', value: 'false' }
  { name: 'PUBLIC_DEMO_ENABLED', value: 'false' }
  { name: 'WEBHOOKS_ENABLED', value: 'false' }
  { name: 'BOOTSTRAP_ADMIN_ENABLED', value: 'false' }
  { name: 'MAX_CONVERSATION_MINUTES', value: '5' }
  { name: 'MAX_CONCURRENT_SESSIONS', value: '25' }
  { name: 'RATE_LIMIT_AUTH_PER_MINUTE', value: '10' }
  { name: 'RATE_LIMIT_REGISTRATIONS_PER_HOUR', value: '3' }
  { name: 'RATE_LIMIT_VERIFICATIONS_PER_DAY', value: '3' }
  { name: 'RATE_LIMIT_VOICE_SESSIONS_PER_HOUR', value: '3' }
]

resource parser 'Microsoft.App/containerApps@2025-01-01' = {
  name: parserName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: frontendIdentityMap }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: { activeRevisionsMode: 'Single', ingress: { external: false, targetPort: 8090, transport: 'auto', allowInsecure: false }, registries: registryFrontend }
    template: { containers: [{ name: 'parser', image: placeholderImage, resources: { cpu: json('1.0'), memory: '2Gi' }, env: [{ name: 'KNOWLEDGE_PARSER_PORT', value: '8090' }], probes: [{ type: 'Liveness', httpGet: { path: '/health', port: 8090 }, initialDelaySeconds: 20, periodSeconds: 20 }, { type: 'Readiness', httpGet: { path: '/health', port: 8090 }, initialDelaySeconds: 10, periodSeconds: 10 }] }], scale: { minReplicas: 1, maxReplicas: 3, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }] } }
  }
  dependsOn: [frontendAcrPull]
}

var parserUrl = 'https://${parserName}.${containerEnvironment.properties.defaultDomain}'
var apiInternalUrl = 'https://${apiName}.${containerEnvironment.properties.defaultDomain}'

resource api 'Microsoft.App/containerApps@2025-01-01' = {
  name: apiName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: backendIdentityMap }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: { activeRevisionsMode: 'Multiple', maxInactiveRevisions: 5, ingress: { external: true, targetPort: 3001, transport: 'auto', allowInsecure: false, traffic: [{ latestRevision: true, weight: 100 }] }, registries: registryBackend, secrets: backendSecretRefs }
    template: { containers: [{ name: 'api', image: placeholderImage, resources: { cpu: json('0.5'), memory: '1Gi' }, env: concat(commonBackendEnv, [{ name: 'API_PORT', value: '3001' }, { name: 'INTERNAL_API_URL', value: apiInternalUrl }, { name: 'KNOWLEDGE_PARSER_URL', value: parserUrl }]), probes: [{ type: 'Startup', httpGet: { path: '/health/live', port: 3001 }, initialDelaySeconds: 5, periodSeconds: 5, failureThreshold: 30 }, { type: 'Liveness', httpGet: { path: '/health/live', port: 3001 }, periodSeconds: 20 }, { type: 'Readiness', httpGet: { path: '/health/ready', port: 3001 }, periodSeconds: 10 }] }], scale: { minReplicas: 2, maxReplicas: 6, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }] } }
  }
  dependsOn: [backendAcrPull, backendBlobAccess, backendVaultAccess, vaultSecrets, databaseUrlSecret, redisUrlSecret, parser, blobDnsGroup, vaultDnsGroup, redisDnsGroup]
}

resource web 'Microsoft.App/containerApps@2025-01-01' = {
  name: webName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: frontendIdentityMap }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: { activeRevisionsMode: 'Multiple', maxInactiveRevisions: 5, ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false, traffic: [{ latestRevision: true, weight: 100 }] }, registries: registryFrontend }
    template: { containers: [{ name: 'web', image: placeholderImage, resources: { cpu: json('0.5'), memory: '1Gi' }, env: [{ name: 'PORT', value: '3000' }, { name: 'HOSTNAME', value: '0.0.0.0' }, { name: 'NEXT_PUBLIC_API_URL', value: publicApiUrl }, { name: 'NEXT_PUBLIC_LIVEKIT_URL', value: livekitUrl }, { name: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', value: googleClientId }, { name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', value: turnstileSiteKey }], probes: [{ type: 'Liveness', httpGet: { path: '/', port: 3000 }, initialDelaySeconds: 15, periodSeconds: 20 }, { type: 'Readiness', httpGet: { path: '/', port: 3000 }, initialDelaySeconds: 10, periodSeconds: 10 }] }], scale: { minReplicas: 2, maxReplicas: 6, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }] } }
  }
  dependsOn: [frontendAcrPull]
}

resource worker 'Microsoft.App/containerApps@2025-01-01' = {
  name: workerName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: backendIdentityMap }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: { activeRevisionsMode: 'Single', registries: registryBackend, secrets: backendSecretRefs }
    template: { containers: [{ name: 'worker', image: placeholderImage, resources: { cpu: json('0.5'), memory: '1Gi' }, env: concat(commonBackendEnv, [{ name: 'INTERNAL_API_URL', value: apiInternalUrl }, { name: 'KNOWLEDGE_PARSER_URL', value: parserUrl }]) }], scale: { minReplicas: 2, maxReplicas: 4, rules: [{ name: 'cpu', custom: { type: 'cpu', metadata: { type: 'Utilization', value: '60' } } }] } }
  }
  dependsOn: [api]
}

resource voice 'Microsoft.App/containerApps@2025-01-01' = {
  name: voiceAgentName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: backendIdentityMap }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: { activeRevisionsMode: 'Single', registries: registryBackend, secrets: backendSecretRefs }
    template: { containers: [{ name: 'voice-agent', image: placeholderImage, resources: { cpu: json('1.0'), memory: '2Gi' }, env: [{ name: 'INTERNAL_API_URL', value: apiInternalUrl }, { name: 'LIVEKIT_URL', secretRef: 'livekit-url' }, { name: 'LIVEKIT_API_KEY', secretRef: 'livekit-api-key' }, { name: 'LIVEKIT_API_SECRET', secretRef: 'livekit-api-secret' }, { name: 'VOICE_AGENT_SERVICE_SECRET', secretRef: 'voice-agent-service-secret' }, { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }, { name: 'DEEPGRAM_API_KEY', secretRef: 'deepgram-api-key' }, { name: 'ELEVENLABS_API_KEY', secretRef: 'elevenlabs-api-key' }, { name: 'ELEVENLABS_MONTENEGRIN_VOICE_ID', secretRef: 'elevenlabs-voice-id' }] }], scale: { minReplicas: 2, maxReplicas: 6, rules: [{ name: 'cpu', custom: { type: 'cpu', metadata: { type: 'Utilization', value: '60' } } }] } }
  }
  dependsOn: [api]
}

var opsEnv = concat(commonBackendEnv, [{ name: 'INTERNAL_API_URL', value: apiInternalUrl }, { name: 'KNOWLEDGE_PARSER_URL', value: parserUrl }])
resource migrationJob 'Microsoft.App/jobs@2025-01-01' = {
  name: migrationJobName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: backendIdentityMap }
  properties: { environmentId: containerEnvironment.id, configuration: { triggerType: 'Manual', replicaTimeout: 1800, replicaRetryLimit: 1, manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }, registries: registryBackend, secrets: backendSecretRefs }, template: { containers: [{ name: 'migrate', image: placeholderImage, command: ['node', 'dist/src/migrate.js'], resources: { cpu: json('0.5'), memory: '1Gi' }, env: opsEnv }] } }
  dependsOn: [api]
}
resource seedJob 'Microsoft.App/jobs@2025-01-01' = {
  name: seedJobName
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: backendIdentityMap }
  properties: { environmentId: containerEnvironment.id, configuration: { triggerType: 'Manual', replicaTimeout: 1800, replicaRetryLimit: 1, manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }, registries: registryBackend, secrets: backendSecretRefs }, template: { containers: [{ name: 'seed', image: placeholderImage, command: ['node', 'dist/src/seed.js'], resources: { cpu: json('0.5'), memory: '1Gi' }, env: opsEnv }] } }
  dependsOn: [migrationJob]
}

var alertDefinitions = [
  {
    name: 'readiness-failures'
    displayName: 'Montenegrina readiness failures'
    query: 'ContainerAppConsoleLogs_CL | where tostring(pack_all()) has "/health/ready" and tostring(pack_all()) has "503"'
    threshold: 0
  }
  {
    name: 'http-5xx'
    displayName: 'Montenegrina elevated HTTP 5xx responses'
    query: 'ContainerAppConsoleLogs_CL | where tostring(pack_all()) matches regex @"\\b5[0-9]{2}\\b"'
    threshold: 4
  }
  {
    name: 'restart-loop'
    displayName: 'Montenegrina container restart loop'
    query: 'ContainerAppSystemLogs_CL | where tostring(pack_all()) has_any ("Restart", "BackOff", "CrashLoop")'
    threshold: 2
  }
  {
    name: 'replica-exhaustion'
    displayName: 'Montenegrina replica capacity exhausted'
    query: 'ContainerAppSystemLogs_CL | where tostring(pack_all()) has_any ("maxReplicas", "Maximum replica", "FailedScheduling")'
    threshold: 0
  }
  {
    name: 'postgres-redis-health'
    displayName: 'Montenegrina PostgreSQL or Redis health degradation'
    query: 'AzureActivity | where ResourceGroup == "${resourceGroup().name}" and ResourceProviderValue in~ ("MICROSOFT.DBFORPOSTGRESQL", "MICROSOFT.CACHE") and ActivityStatusValue =~ "Failed"'
    threshold: 0
  }
  {
    name: 'queue-failures'
    displayName: 'Montenegrina queue processing failures'
    query: 'ContainerAppConsoleLogs_CL | where tostring(pack_all()) has_any ("queue failed", "job failed", "dead-letter", "dead letter")'
    threshold: 0
  }
  {
    name: 'provider-errors'
    displayName: 'Montenegrina voice or AI provider errors'
    query: 'ContainerAppConsoleLogs_CL | where tostring(pack_all()) has_any ("PROVIDER_ERROR", "LiveKit error", "Deepgram error", "ElevenLabs error", "OpenAI error")'
    threshold: 2
  }
]

resource operationalAlerts 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = [for alert in alertDefinitions: {
  name: 'alert-${environmentName}-${alert.name}'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: alert.displayName
    description: '${alert.displayName}. Investigate the production runbook and application traces.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [logs.id]
    targetResourceTypes: ['Microsoft.OperationalInsights/workspaces']
    criteria: {
      allOf: [
        {
          query: alert.query
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: alert.threshold
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    actions: { actionGroups: [] }
  }
}]

output registryName string = registry.name
output registryEndpoint string = registry.properties.loginServer
output keyVaultName string = vault.name
output webName string = web.name
output apiName string = api.name
output workerName string = worker.name
output voiceAgentName string = voice.name
output parserName string = parser.name
output migrationJobName string = migrationJob.name
output seedJobName string = seedJob.name
output webUri string = 'https://${web.properties.configuration.ingress.fqdn}'
output apiUri string = 'https://${api.properties.configuration.ingress.fqdn}'
