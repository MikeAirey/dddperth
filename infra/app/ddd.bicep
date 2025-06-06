param name string
param location string = resourceGroup().location
param tags object = {}

param domainName string
param certificateId string
param identityName string
param containerRegistryName string
param containerAppsEnvironmentName string
param applicationInsightsName string
param gitHubOrganization string
param gitHubRepo string
@secure()
param gitHubToken string
@secure()
param googleFormsApiKey string
@secure()
param googleFormsFileId string
param exists bool
param eventsAirClientId string
@secure()
param eventsAirClientSecret string
param eventsAirTenantId string
param eventsAirEventId string
@secure()
param titoSecurityToken string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' existing = {
  name: containerRegistryName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: containerAppsEnvironmentName
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: containerRegistry
  name: guid(subscription().id, resourceGroup().id, identity.id, 'acrPullRole')
  properties: {
    roleDefinitionId:  subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalType: 'ServicePrincipal'
    principalId: identity.properties.principalId
  }
}

@secure()
param sessionSecret string = uniqueString(newGuid())

module fetchLatestImage '../modules/fetch-container-image.bicep' = {
  name: '${name}-fetch-image'
  params: {
    exists: exists
    name: name
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, {'azd-service-name':  'ddd' })
  dependsOn: [ acrPullRole ]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      ingress:  {
        external: true
        targetPort: 80
        transport: 'auto'
        customDomains: [
          {
            bindingType: 'SniEnabled'
            certificateId: certificateId
            name: domainName
          }
        ]
      }
      registries: [
        {
          server: '${containerRegistryName}.azurecr.io'
          identity: identity.id
        }
      ]
      secrets: [
        {
            name: 'github-token'
            value: gitHubToken
        }
        {
            name: 'session-secret'
            value: sessionSecret
        }
        {
            name: 'google-forms-api-key'
            value: googleFormsApiKey
        }
        {
            name: 'google-forms-file-id'
            value: googleFormsFileId
        }
        {
            name: 'events-air-client-id'
            value: eventsAirClientId
        }
        {
            name: 'events-air-client-secret'
            value: eventsAirClientSecret
        }
        {
            name: 'events-air-tenant-id'
            value: eventsAirTenantId
        }
        {
            name: 'events-air-event-id'
            value: eventsAirEventId
        }
        {
            name: 'tito-security-token'
            value: titoSecurityToken
        }
      ]
    }
    template: {
      containers: [
        {
          image: fetchLatestImage.outputs.?containers[?0].?image ?? 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          name: 'main'
          env: [
            {
              name: 'WEB_URL'
              value: 'https://${domainName}'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsights.properties.ConnectionString
            }
            {
              name: 'PORT'
              value: '80'
            }
            {
                name: 'GITHUB_ORGANIZATION'
                value: gitHubOrganization
            }
            {
                name: 'GITHUB_REPO'
                value: gitHubRepo
            }
            {
                name: 'GITHUB_TOKEN'
                secretRef: 'github-token'
            }
            {
                name: 'SESSION_SECRET'
                secretRef: 'session-secret'
            }
            {
                name: 'GOOGLE_FORMS_API_KEY'
                secretRef: 'google-forms-api-key'
            }
            {
                name: 'GOOGLE_FORMS_FILE_ID'
                secretRef: 'google-forms-file-id'
            }
            {
                name: 'TITO_SECURITY_TOKEN'
                secretRef: 'tito-security-token'
            }
            {
                name: 'EVENTS_AIR_CLIENT_ID'
                secretRef: 'events-air-client-id'
            }
            {
                name: 'EVENTS_AIR_CLIENT_SECRET'
                secretRef: 'events-air-client-secret'
            }
            {
                name: 'EVENTS_AIR_TENANT_ID'
                secretRef: 'events-air-tenant-id'
            }
            {
                name: 'EVENTS_AIR_EVENT_ID'
                secretRef: 'events-air-event-id'
            }
          ]

          resources: {
            cpu: json('1.0')
            memory: '2.0Gi'
          }
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
      }
    }
  }
}

output defaultDomain string = containerAppsEnvironment.properties.defaultDomain
output name string = app.name
output uri string = 'https://${app.properties.configuration.ingress.fqdn}'
output id string = app.id
