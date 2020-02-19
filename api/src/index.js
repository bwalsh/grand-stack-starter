import { typeDefs } from "./graphql-schema";
import { ApolloServer, gql } from "apollo-server-express";
import { makeAugmentedSchema } from "neo4j-graphql-js";
import { neo4jgraphql } from "neo4j-graphql-js";
// import { makeExecutableSchema } from "apollo-server";

import express from "express";
import { v1 as neo4j } from "neo4j-driver";
import dotenv from "dotenv";

const { Client } = require('@elastic/elasticsearch')
const util = require('util')

// set environment variables from ../.env
dotenv.config();

// elastic
const elastic = new Client({ node: process.env.ELASTIC_URI })
const INDEX = 'users'

const app = express();
// todo - add logging

// resolvers
const resolvers = {


  User: {
    metrics: (object, fields, ctx, resolveInfo) => {
      console.log('User.metrics: ---------------------')
      console.log(`  parent: ${resolveInfo.parentType}: ${util.inspect(object, false, null, true)}`)
      // retrieve aggregations from elastic ...
      const aggregateUsers = async (user_ids) => {
        const results = await elastic.search( {
          index: INDEX,
          q: `id:(${user_ids.map(s => `'${s}'`).join(',')})`,
          _source_includes: ['id', 'reviews_length']
        });
        console.log(`from elastic`)
        console.log(util.inspect(results.body, false, null, true))
        const metrics = results.body.hits.hits.map(h => {
          return {id: h._source.id, reviews_length: h._source.reviews_length};
        })
        console.log(util.inspect(metrics, false, null, true))
        return metrics
      }
      // fetch from external service ...
      return aggregateUsers([object.id]).then(metrics => {
        console.log(util.inspect(metrics, false, null, true))
        // ... return directly to graphql result
        return metrics[0]
      }) ;
    }

  },

  Query: {
    /**
    * simulate call out to another system (elastic, REST, etc)
    * retrieve list of user ids then fetch them from neo4j
    **/
    searchUsers(object, params, ctx, resolveInfo) {
      console.log('searchUsers: ---------------------')

      // query elastic's index, return ids
      const findUsers = async (q) => {
        const results = await elastic.search( {
          index: INDEX,
          q: q,
          _source_includes: 'id'
        });
        // console.log(`from elastic`)
        // console.log(util.inspect(results, false, null, true))
        const ids = results.body.hits.hits.map(h => h._source.id)
        // console.log(util.inspect(ids, false, null, true))
        return ids
      }
      // fetch from external service ...
      return findUsers(params.q)
        .then(
          user_ids => {
            // ... pass ids to neo4j for resolution
            return neo4jgraphql(object, {id: user_ids}, ctx, resolveInfo)
          }
        );

      // Simple example
      // const findUsers = (params) => ["u1", "u3"];
      // return neo4jgraphql(object, {id: findUsers(params)}, ctx, resolveInfo);

    } // end searchUsers
  } // end Query
} // end resolvers;


/*
 * Create a Neo4j driver instance to connect to the database
 * using credentials specified as environment variables
 * with fallback to defaults
 */
const driver = neo4j.driver(
  process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4j.auth.basic(
    process.env.NEO4J_USER || "neo4j",
    process.env.NEO4J_PASSWORD || "neo4j"
  )
);

/*
 * Create a new ApolloServer instance, serving the GraphQL schema
 * created using makeAugmentedSchema above and injecting the Neo4j driver
 * instance into the context object so it is available in the
 * generated resolvers to connect to the database.
 */
 const schema = makeAugmentedSchema({
   typeDefs,
   resolvers
 });


/*
 * Create a new ApolloServer instance, serving the GraphQL schema
 * created using makeAugmentedSchema above and injecting the Neo4j driver
 * instance into the context object so it is available in the
 * generated resolvers to connect to the database.
 */
const server = new ApolloServer({
  context: { driver },
  schema: schema,
  introspection: true,
  playground: true
});


// Specify port and path for GraphQL endpoint
const port = process.env.GRAPHQL_LISTEN_PORT || 4001;
const path = "/graphql";

/*
* Optionally, apply Express middleware for authentication, etc
* This also also allows us to specify a path for the GraphQL endpoint
*/
server.applyMiddleware({app, path});

app.listen({port, path}, () => {
  console.log(`GraphQL server ready at http://localhost:${port}${path}`);
});
