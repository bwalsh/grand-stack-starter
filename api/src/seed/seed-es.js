import ApolloClient from "apollo-client";
import gql from "graphql-tag";
import dotenv from "dotenv";
import seedmutations from "./seed-mutations";
import fetch from "node-fetch";
import { HttpLink } from "apollo-link-http";
import { InMemoryCache } from "apollo-cache-inmemory";
// import { util } from "util"
const util = require('util')

dotenv.config();

const client = new ApolloClient({
  link: new HttpLink({ uri: process.env.GRAPHQL_URI, fetch }),
  cache: new InMemoryCache()
});

const { Client } = require('@elastic/elasticsearch')
const elastic = new Client({ node: process.env.ELASTIC_URI })

const INDEX = 'users'

const dropIndex = async () => elastic.indices.delete({index: INDEX})
  .then( value => console.log(`Dropped index ${INDEX}`))
  .catch( error => console.log(`Could not drop index ${INDEX}`, error))
  ;

const toElastic = async (user) => {
  user.reviews_length = user.reviews.length
  await elastic.index({
    index: INDEX,
    type: '_doc', // uncomment this line if you are using {es} ≤ 6
    id: user.id,
    body: user
  })
  console.log(`Added user ${user.id} to ${INDEX}`);
}

// drop the index
dropIndex()
  .then(ignore => {
    // query neo for all the Users
    client
      .query({
        query: gql('{User {id name reviews {id text business {id name}}}}')
      })
      .then(data => {
          // console.log(util.inspect(data.data.User, false, null, true /* enable colors */))
          // store it in elastic
          data.data.User.map(toElastic)
        }
      )
      .catch(error => console.error(error));
  });
